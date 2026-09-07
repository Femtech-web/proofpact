import Link from "next/link";
import { notFound } from "next/navigation";
import { withPactStoreRead } from "@/app/app/_lib/pact-data";
import { getPolicyPack } from "@/features/policies/domain/policy-pack";
import { buildFundingPlan } from "@/features/funding/domain/funding-plan";
import { isAddress } from "viem";
import { PactRoleActions } from "./pact-role-actions";
import { verificationInputFromSubmission } from "@/features/verification/application/submission-verification-input";
import { buildPactVerificationRequestSet } from "@/features/verification/application/secure-delivery-request-set";
import styles from "../../workspace.module.css";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const result = await withPactStoreRead(async (store) => {
    const [pact, submission, receipt, changeRequest] = await Promise.all([
      store.getPact(jobId),
      store.getLatestSubmission(jobId),
      store.getLatestReceiptForPact(jobId),
      store.getLatestChangeRequest(jobId),
    ]);
    return { pact, submission, receipt, changeRequest };
  });
  if (!result.pact) notFound();
  const pack = getPolicyPack(result.pact.policyPackId);
  const escrowAddress = process.env.PROOFPACT_ESCROW_ADDRESS?.trim();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fundingPlan = result.pact.status === "DRAFT" && escrowAddress && isAddress(escrowAddress)
    ? buildFundingPlan({
      externalPactId: result.pact.id,
      requesterAddress: result.pact.requesterAddress,
      workerAddress: result.pact.workerAddress,
      policyPackId: result.pact.policyPackId,
      policyVersion: result.pact.policyVersion,
      title: result.pact.title,
      acceptanceCriteria: result.pact.acceptanceCriteria,
      rewardUsdc: result.pact.rewardUsdc,
      escrowAddress,
      refundAfter: nowSeconds + 30 * 24 * 60 * 60,
    }, nowSeconds)
    : undefined;
  const verificationIntents = result.submission && (result.pact.status === "SUBMITTED" || result.pact.status === "HELD")
    ? buildPactVerificationRequestSet(verificationInputFromSubmission(result.pact, result.submission)).map((request) => request.intent)
    : undefined;
  return <section className={styles.detailPage}>
    <p>PACT / {result.pact.id.toUpperCase()}</p>
    <h1>{result.pact.title}</h1>
    <div className={styles.decisionBanner}>
      <span>Current lifecycle state</span>
      <strong>{result.pact.status}</strong>
      <p>{result.pact.status === "APPROVED" ? "Policy passed. Funds are not released until the Base transaction confirms." : "Database state is reported independently from onchain custody and settlement."}</p>
    </div>
    <dl className={styles.metadataGrid}>
      <div><dt>Policy</dt><dd>{pack.name} / {result.pact.policyVersion}</dd></div>
      <div><dt>Reward</dt><dd>{result.pact.rewardUsdc} USDC</dd></div>
      <div><dt>Requester</dt><dd><code>{result.pact.requesterAddress}</code></dd></div>
      <div><dt>Worker</dt><dd><code>{result.pact.workerAddress}</code></dd></div>
      <div><dt>Funding transaction</dt><dd><code>{result.pact.fundingTransactionHash ?? "Not recorded"}</code></dd></div>
      <div><dt>Escrow</dt><dd><code>{result.pact.escrowAddress ?? "Not deployed for this pact"}</code></dd></div>
      <div><dt>Onchain pact ID</dt><dd><code>{result.pact.onchainPactId ?? "Created when funded"}</code></dd></div>
      <div><dt>Requester recovery</dt><dd>{result.pact.refundAfter ? new Date(result.pact.refundAfter).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "Set by the funding transaction"}</dd></div>
    </dl>
    <PactRoleActions
      pactId={result.pact.id}
      status={result.pact.status}
      requesterAddress={result.pact.requesterAddress}
      workerAddress={result.pact.workerAddress}
      fundingPlan={fundingPlan}
      submission={result.submission ? { id: result.submission.id, artifactHash: result.submission.artifactHash } : undefined}
      latestReceipt={result.receipt ? { id: result.receipt.id, decision: result.receipt.decision } : undefined}
      latestChangeRequest={result.changeRequest ? { submissionId: result.changeRequest.submissionId, feedback: result.changeRequest.feedback } : undefined}
      verificationIntents={verificationIntents}
      policyPackId={result.pact.policyPackId}
    />
    <h2>Acceptance criteria</h2><p>{result.pact.acceptanceCriteria}</p>
    <h2>Latest evidence</h2>
    {result.submission ? <div className={styles.receiptSummary}>
      <code>sequence       {result.submission.sequence}</code>
      <code>artifact       {result.submission.artifactHash}</code>
      <code>submitted_by   {result.submission.submittedBy}</code>
      <code>claim          {result.submission.claimedRemediation}</code>
    </div> : <p>No worker submission has been recorded.</p>}
    {result.receipt ? <Link href={`/app/receipts/${result.receipt.id}`}>Open replayable receipt →</Link> : null}
  </section>;
}
