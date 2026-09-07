"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import type { FundingPlan } from "@/features/funding/domain/funding-plan";
import { FundPact } from "./fund-pact";
import { WorkerSubmissionForm } from "./worker-submission-form";
import { VerifyDelivery } from "./verify-delivery";
import { VerificationProgress } from "./verification-progress";
import { RequestChanges } from "./request-changes";
import { ReleasePact } from "./release-pact";
import type { VerificationIntent } from "@/features/verification/domain/verification";
import type { PolicyPackId } from "@/features/policies/domain/policy-pack";
import styles from "../../workspace.module.css";

type Props = Readonly<{
  pactId: string;
  status: string;
  requesterAddress: string;
  workerAddress: string;
  fundingPlan?: FundingPlan;
  submission?: Readonly<{ id: string; artifactHash: `0x${string}` }>;
  latestReceipt?: Readonly<{ id: string; decision: string }>;
  latestChangeRequest?: Readonly<{ submissionId: string; feedback: string }>;
  verificationIntents?: readonly VerificationIntent[];
  policyPackId: PolicyPackId;
}>;

export function PactRoleActions({ pactId, status, requesterAddress, workerAddress, fundingPlan, submission, latestReceipt, latestChangeRequest, verificationIntents, policyPackId }: Props) {
  const { address } = useAccount();
  const normalized = address?.toLowerCase();
  const isRequester = normalized === requesterAddress.toLowerCase();
  const isWorker = normalized === workerAddress.toLowerCase();

  if (status === "DRAFT" && fundingPlan) {
    return isRequester
      ? <FundPact plan={fundingPlan} requesterAddress={requesterAddress} externalPactId={pactId} />
      : <RoleNotice label="Requester action" title="Waiting for funding" body={`Only the recorded requester ${requesterAddress} can fund this pact.`} />;
  }

  if (status === "FUNDED" || status === "HELD") {
    const requestedRevision = status === "HELD" && submission && latestChangeRequest?.submissionId === submission.id;
    const verifierRetry = !requestedRevision && status === "HELD" && latestReceipt?.decision === "RETRY" && submission && verificationIntents;
    if (verifierRetry) {
      if (isRequester) return <>
        <RoleNotice
          label="Verification retry"
          title="Evidence is unchanged; verification needs another pass"
          body="The last receipt was inconclusive rather than a worker failure. Authorize a fresh bounded verification of the same signed evidence."
          receipt={latestReceipt}
        />
        <VerifyDelivery
          pactId={pactId}
          submissionId={submission.id}
          artifactHash={submission.artifactHash}
          requesterAddress={requesterAddress}
          intents={verificationIntents}
          previousReceiptId={latestReceipt?.id}
        />
      </>;
      if (isWorker) return <RoleNotice label="Requester verification" title="No new work is required yet" body="The latest receipt requested a verification retry. The requester can rerun the checks against your existing signed evidence." receipt={latestReceipt} />;
    }
    if (isWorker) return <>
      {requestedRevision ? <section className={styles.roleHandoff}><span>Requester feedback</span><h2>Changes requested</h2><p>{latestChangeRequest.feedback}</p></section> : status === "HELD" ? <RemediationNotice receipt={latestReceipt} /> : null}
      <WorkerSubmissionForm pactId={pactId} workerAddress={workerAddress} policyPackId={policyPackId} />
    </>;
    if (isRequester) return <RoleNotice
      label={status === "HELD" ? "Remediation required" : "Worker handoff"}
      title={status === "HELD" ? "Waiting for remediation" : "Waiting for delivery"}
      body={status === "HELD"
        ? `Escrow remains locked. Review the latest receipt, then ask the recorded worker ${workerAddress} to submit a materially changed commit or evidence package.`
        : `The recorded worker ${workerAddress} must connect, sign, and submit the next evidence package.`}
      receipt={status === "HELD" ? latestReceipt : undefined}
    />;
    return <RoleNotice label="Read-only access" title="No action for this wallet" body="Connect the recorded requester or worker account to perform its assigned pact action." />;
  }

  if (status === "SUBMITTED" && submission && verificationIntents) {
    if (isRequester) return <><VerifyDelivery
      pactId={pactId}
      submissionId={submission.id}
      artifactHash={submission.artifactHash}
      requesterAddress={requesterAddress}
      intents={verificationIntents}
      previousReceiptId={latestReceipt?.id}
    /><RequestChanges pactId={pactId} submissionId={submission.id} /></>;
    if (isWorker) return <RoleNotice label="Requester verification" title="Delivery submitted" body="The requester must authorize the bounded Telegraph verification. Escrow remains locked." />;
    return <RoleNotice label="Read-only access" title="Verification awaits requester" body="Only the recorded requester can authorize paid verification of this submission." />;
  }

  if (status === "VERIFYING" && submission) {
    return <VerificationProgress pactId={pactId} submissionId={submission.id} previousReceiptId={latestReceipt?.id} />;
  }

  if (status === "APPROVED" && latestReceipt) {
    return isRequester
      ? <ReleasePact pactId={pactId} receiptId={latestReceipt.id} requesterAddress={requesterAddress} />
      : <RoleNotice label="Base settlement" title="Waiting for release" body="Verification passed. The requester must submit the receipt-bound Base transaction that releases escrow to the worker." receipt={latestReceipt} />;
  }

  if (status === "RELEASED") return <RoleNotice label="Settlement complete" title="Payment released" body="Base confirmed the receipt-bound transfer to the recorded worker." receipt={latestReceipt} />;

  return null;
}

function RemediationNotice({ receipt }: Readonly<{ receipt?: { id: string; decision: string } }>) {
  return <section className={styles.roleHandoff}>
    <span>Previous verification · {receipt?.decision ?? "HELD"}</span>
    <h2>Revise, then resubmit</h2>
    <p>The prior evidence did not satisfy every required check. Submit a changed commit, deployment, or remediation claim; ProofPact refuses an identical artifact commitment.</p>
    {receipt ? <Link href={`/app/receipts/${receipt.id}`}>Review the latest receipt →</Link> : null}
  </section>;
}

function RoleNotice({ label, title, body, receipt }: Readonly<{
  label: string;
  title: string;
  body: string;
  receipt?: { id: string; decision: string };
}>) {
  return <section className={styles.roleHandoff}>
    <span>{label}</span>
    <h2>{title}</h2>
    <p>{body}</p>
    {receipt ? <Link href={`/app/receipts/${receipt.id}`}>Review the latest receipt →</Link> : null}
  </section>;
}
