"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildRequesterVerificationMessage } from "@/features/verification/domain/requester-verification-authorization";
import type { VerificationIntent } from "@/features/verification/domain/verification";
import { authorizeVerificationAction } from "./actions";
import { readVerificationSnapshot } from "./verification-progress";
import styles from "../../workspace.module.css";

const MAX_COST_USDC = 0.12;
const POLL_INTERVAL_MS = 2_500;
const STATUS_TIMEOUT_MS = 12 * 60_000;

async function waitForPersistedOutcome(
  pactId: string,
  submissionId: string,
  previousReceiptId: string | undefined,
  onProgress: (status: string) => void,
  signal: AbortSignal,
): Promise<Readonly<{ receiptId: string; decision: string }>> {
  const deadline = Date.now() + STATUS_TIMEOUT_MS;
  while (Date.now() < deadline && !signal.aborted) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_INTERVAL_MS);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    if (signal.aborted) throw new DOMException("Status polling stopped.", "AbortError");
    try {
      const snapshot = await readVerificationSnapshot(pactId, signal);
      if (snapshot.submissionId !== submissionId) throw new Error("A newer worker submission replaced this verification.");
      if (snapshot.receipt && snapshot.receipt.id !== previousReceiptId) {
        return { receiptId: snapshot.receipt.id, decision: snapshot.receipt.decision };
      }
      if (!new Set(["HELD", "VERIFYING", "SUBMITTED"]).has(snapshot.pactStatus)) {
        throw new Error(`Verification stopped in ${snapshot.pactStatus} without a receipt.`);
      }
      onProgress("Paying Miners and verifying…");
    } catch (error) {
      if (error instanceof Error && /newer worker|without a receipt/.test(error.message)) throw error;
      onProgress("Verification continues; reconnecting to status…");
    }
  }
  throw new Error("Verification is still running. You may refresh or leave this page; ProofPact will recover the persisted result when it completes.");
}

export function VerifyDelivery({ pactId, submissionId, artifactHash, requesterAddress, intents, previousReceiptId }: Readonly<{
  pactId: string;
  submissionId: string;
  artifactHash: `0x${string}`;
  requesterAddress: string;
  intents: readonly VerificationIntent[];
  previousReceiptId?: string;
}>) {
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("Verify delivery");
  const [error, setError] = useState("");
  const isRequester = Boolean(address && address.toLowerCase() === requesterAddress.toLowerCase());

  async function verify() {
    const statusController = new AbortController();
    setPending(true);
    setError("");
    try {
      if (!isRequester) throw new Error(`Switch to requester ${requesterAddress}.`);
      const authorization = {
        pactId,
        submissionId,
        artifactHash,
        intents,
        maxCostUsdc: MAX_COST_USDC,
        nonce: crypto.randomUUID(),
        deadline: Math.floor(Date.now() / 1000) + 10 * 60,
      } as const;
      setStatus("Awaiting requester signature…");
      const signature = await signMessageAsync({ message: buildRequesterVerificationMessage(authorization) });
      setStatus("Paying Miners and verifying…");
      const actionPromise = authorizeVerificationAction({ ...authorization, signature });
      const persistedPromise = waitForPersistedOutcome(pactId, submissionId, previousReceiptId, setStatus, statusController.signal);
      const completed = await Promise.race([
        actionPromise.then((result) => ({ source: "action" as const, result })),
        persistedPromise.then((result) => ({ source: "receipt" as const, result })),
      ]);
      if (completed.source === "action") {
        if (!completed.result.ok) throw new Error(completed.result.error);
        setStatus(`${completed.result.decision} · ${completed.result.costUsdc.toFixed(2)} USDC`);
        router.push(`/app/receipts/${completed.result.receiptId}`);
      } else {
        setStatus(`${completed.result.decision} · receipt recorded`);
        router.push(`/app/receipts/${completed.result.receiptId}`);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
      setStatus("Verify delivery");
    } finally {
      statusController.abort();
      setPending(false);
    }
  }

  return <section className={styles.reviewPanel}>
    <div>
      <span>Requester verification</span>
      <strong>Review the worker&apos;s delivery</strong>
      <p>ProofPact will buy {intents.length} independent Telegraph checks. Expected first-pass cost is {(intents.length * 0.01).toFixed(2)} USDC; retries can never exceed 0.12 USDC.</p>
      <small>Signing authorizes only this submission and cost ceiling. It cannot release escrow.</small>
      {pending ? <p role="status">Live Miner routing is sequential and may take several minutes when a paid route requires onchain reconciliation. Keep this page open; ProofPact will not blindly repeat an ambiguous payment.</p> : null}
    </div>
    <button type="button" onClick={verify} disabled={pending || !isRequester} aria-busy={pending}>
      {status}<span>→</span>
    </button>
    {error ? <p className={styles.formError} role="alert">{error}</p> : null}
  </section>;
}
