"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../../workspace.module.css";

type VerificationSnapshot = Readonly<{
  pactStatus: string;
  submissionId?: string;
  receipt: Readonly<{ id: string; decision: string }> | null;
}>;

const POLL_INTERVAL_MS = 2_500;

export async function readVerificationSnapshot(pactId: string, signal?: AbortSignal): Promise<VerificationSnapshot> {
  const response = await fetch(`/api/pacts/${encodeURIComponent(pactId)}/verification-status`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Verification status is temporarily unavailable.");
  return response.json() as Promise<VerificationSnapshot>;
}

export function VerificationProgress({ pactId, submissionId, previousReceiptId }: Readonly<{
  pactId: string;
  submissionId: string;
  previousReceiptId?: string;
}>) {
  const router = useRouter();
  const [message, setMessage] = useState("Telegraph Miners are checking the submitted evidence…");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const snapshot = await readVerificationSnapshot(pactId, controller.signal);
        if (snapshot.submissionId !== submissionId) {
          setMessage("A newer worker submission is now active. Refreshing…");
          router.refresh();
          return;
        }
        if (snapshot.receipt && snapshot.receipt.id !== previousReceiptId) {
          setMessage(`${snapshot.receipt.decision} decision recorded. Opening receipt…`);
          router.push(`/app/receipts/${snapshot.receipt.id}`);
          router.refresh();
          return;
        }
        if (snapshot.pactStatus !== "VERIFYING") {
          setMessage(`${snapshot.pactStatus} state recorded. Refreshing…`);
          router.refresh();
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? `${error.message} Retrying…` : "Status check failed. Retrying…");
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [pactId, previousReceiptId, router, submissionId]);

  return <section className={styles.roleHandoff} aria-live="polite">
    <span>Telegraph verification</span>
    <h2>Verification in progress</h2>
    <p>{message}</p>
    <small>You may leave or refresh this page. ProofPact reads the final result from its persisted receipt.</small>
  </section>;
}
