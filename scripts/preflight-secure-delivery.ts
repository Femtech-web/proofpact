import { withPactStore } from "../app/app/_lib/pact-data";
import { verificationInputFromSubmission } from "../features/verification/application/submission-verification-input";
import { createManagedDnsFetch } from "../infrastructure/http/managed-dns-fetch";
import { preflightSecureDelivery } from "../infrastructure/telegraph/preflight-secure-delivery";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedCost(name: string): number {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`${name} must be greater than 0 and at most 1`);
  return value;
}

const pactId = process.argv.find((argument) => argument.startsWith("--pact="))?.slice("--pact=".length)
  || process.env.PROOFPACT_LIVE_PACT_ID?.trim();
if (!pactId) throw new Error("Pass --pact=<uuid> or set PROOFPACT_LIVE_PACT_ID");

const { pact, submission } = await withPactStore(async (store) => ({
  pact: await store.getPact(pactId),
  submission: await store.getLatestSubmission(pactId),
}));
if (!pact) throw new Error("Pact not found");
if (!submission) throw new Error("Pact has no worker submission");
const input = verificationInputFromSubmission(pact, submission);
const managedFetch = createManagedDnsFetch(process.env.TELEGRAPH_DNS_SERVERS?.trim() || "8.8.8.8");
try {
  const result = await preflightSecureDelivery({
    input,
    nodeUrl: required("TELEGRAPH_ENGINE_URL"),
    maxCostUsdcPerIntent: boundedCost("TELEGRAPH_MAX_PRICE_USDC"),
    maxTotalCostUsdc: boundedCost("TELEGRAPH_MAX_TOTAL_COST_USDC"),
    fetchImpl: managedFetch.fetch,
    signal: AbortSignal.timeout(120_000),
  });
  console.log(JSON.stringify({
    mode: "UNPAID_X402_PREFLIGHT",
    pactId: pact.id,
    submissionId: submission.id,
    artifactHash: submission.artifactHash,
    sourceProof: result.sourceProof,
    totalCostUsdc: result.totalCostUsdc,
    routes: result.challenges.map(({ intent, payment }) => ({
      intent,
      scheme: payment.scheme,
      network: payment.network,
      asset: payment.asset,
      amountUsdc: payment.amountUsdc,
      payTo: payment.payTo,
      maxTimeoutSeconds: payment.maxTimeoutSeconds,
    })),
  }, null, 2));
} finally {
  await managedFetch.close();
}
