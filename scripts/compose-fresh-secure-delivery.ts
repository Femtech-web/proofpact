import { randomUUID } from "node:crypto";
import { withPactStore } from "../app/app/_lib/pact-data";
import { composeFreshEvidence } from "../features/verification/application/fresh-evidence-composer";
import { buildFraudQuestion } from "../features/verification/application/fraud-verification";
import { buildSecureDeliveryIntentQuestion } from "../features/verification/application/secure-delivery-intents";
import { buildPactVerificationRequestSet } from "../features/verification/application/secure-delivery-request-set";
import { verificationInputFromSubmission } from "../features/verification/application/submission-verification-input";
import { evaluateSettlement } from "../features/settlement/domain/evaluate-settlement";
import { canonicalJson, sha256Hex, type JsonValue } from "../shared/json/canonical-json";
import { verifyGithubCommit } from "../infrastructure/source/github-commit-verifier";

const pactId = process.argv.find((argument) => argument.startsWith("--pact="))?.slice(7)
  || process.env.PROOFPACT_LIVE_PACT_ID?.trim();
if (!pactId) throw new Error("Provide --pact=<id>");
if (process.env.PROOFPACT_CONFIRM_EVIDENCE_COMPOSITION !== "YES"
  || process.env.PROOFPACT_CONFIRM_PACT_ID !== pactId) {
  throw new Error(`Explicit evidence-composition confirmation is missing for pact ${pactId}`);
}

const state = await withPactStore(async (store) => {
  const pact = await store.getPact(pactId);
  const submission = await store.getLatestSubmission(pactId);
  const receipts = (await store.listReceipts(100)).filter((receipt) => receipt.pactId === pactId);
  if (!pact || !submission) throw new Error("Pact or submission was not found");
  if (pact.status !== "HELD") throw new Error(`Pact is ${pact.status}, not retry-held`);
  return { pact, submission, receipts };
});

const input = verificationInputFromSubmission({ ...state.pact, status: "SUBMITTED" }, state.submission);
if ("policyPackId" in input) throw new Error("Fresh composition currently supports Secure Delivery only");
const requests = buildPactVerificationRequestSet(input);
const intents = requests.map((request) => request.intent);
const expectedQueryHashes = new Map(intents.map((intent) => {
  const request = intent === "FRAUD_DETECTION"
    ? buildFraudQuestion(input)
    : buildSecureDeliveryIntentQuestion(intent, input);
  return [intent, sha256Hex({ query: request.query, context: request.context })] as const;
}));
const now = new Date();
const composed = composeFreshEvidence({
  receipts: state.receipts,
  submissionId: state.submission.id,
  artifactHash: state.submission.artifactHash,
  policyPackId: state.pact.policyPackId,
  policyVersion: state.pact.policyVersion,
  requiredIntents: intents,
  expectedQueryHashes,
  now,
  maxAgeMs: 60 * 60_000,
});
const decision = evaluateSettlement(composed.signals, state.pact.policyPackId, intents);
if (decision.decision !== "RELEASE") throw new Error(`Composed evidence returned ${decision.decision}: ${decision.reason}`);
const sourceProof = await verifyGithubCommit(input, AbortSignal.timeout(30_000));
const runId = randomUUID();
const decidedAt = new Date().toISOString();
const payload = {
  version: 1,
  kind: "PROOFPACT_COMPOSED_SECURE_DELIVERY_RECEIPT",
  pact_id: state.pact.id,
  submission_id: state.submission.id,
  artifact_hash: state.submission.artifactHash,
  policy_pack: state.pact.policyPackId,
  policy_version: state.pact.policyVersion,
  required_intents: intents,
  source_provenance: {
    provider: sourceProof.provider,
    repository: sourceProof.repository,
    commit_sha: sourceProof.commitSha,
    permalink: sourceProof.permalink,
    observed_at: sourceProof.observedAt,
    response_hash: sourceProof.responseHash,
    claim_terms_matched: [...sourceProof.claimTermsMatched],
  },
  evidence_composition: {
    maximum_age_seconds: 3_600,
    source_receipt_ids: [...composed.sourceReceiptIds],
    composed_at: decidedAt,
    new_authorized_cost_usdc: 0,
    new_settled_cost_usdc: 0,
  },
  decision: decision.decision,
  reason: decision.reason,
  missing_intents: [...decision.missingIntents],
  authorized_cost_usdc: 0,
  settled_cost_usdc: 0,
  inherited_paid_cost_usdc: composed.records.reduce((sum, record) => sum + record.cost_usd, 0),
  records: composed.records.map((record) => ({ ...record })),
  decided_at: decidedAt,
} satisfies JsonValue;
const receiptHash = sha256Hex(canonicalJson(payload));
const idempotencyKey = `composed-${state.submission.id}-${sha256Hex(composed.signals.map((signal) => signal.signalHash))}`;
const receipt = await withPactStore(async (store) => {
  await store.beginVerification(state.pact.id, state.submission.id);
  return store.completeVerification({
    pactId: state.pact.id,
    submissionId: state.submission.id,
    runId,
    idempotencyKey,
    signals: composed.signals,
    decision: { ...decision, policyVersion: state.pact.policyVersion, decidedAt },
    receipt: { receiptHash, artifactHash: state.submission.artifactHash, decision: decision.decision, payload },
  });
});

console.log(JSON.stringify({
  status: "FRESH_EVIDENCE_COMPOSED",
  pactId,
  receiptId: receipt.id,
  receiptHash,
  decision: decision.decision,
  sourceReceiptIds: composed.sourceReceiptIds,
  records: composed.records.map((record) => ({ intent: record.intent, minerId: record.miner_id, observedAt: record.observed_at })),
  newCostUsdc: 0,
}, null, 2));
