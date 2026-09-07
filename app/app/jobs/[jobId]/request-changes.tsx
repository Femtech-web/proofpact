"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignMessage } from "wagmi";
import { buildRequestChangesMessage } from "@/features/jobs/domain/request-changes";
import { requestChangesAction } from "./actions";
import styles from "../../workspace.module.css";

export function RequestChanges({ pactId, submissionId }: Readonly<{ pactId: string; submissionId: string }>) {
  const router = useRouter();
  const { signMessageAsync } = useSignMessage();
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setPending(true);
    setError("");
    try {
      const request = { pactId, submissionId, feedback, nonce: crypto.randomUUID(), deadline: Math.floor(Date.now() / 1000) + 600 };
      const signature = await signMessageAsync({ message: buildRequestChangesMessage(request) });
      const result = await requestChangesAction({ ...request, signature });
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request changes.");
    } finally {
      setPending(false);
    }
  }

  return <section className={styles.roleHandoff}>
    <span>Requester review</span>
    <h2>Need a revision first?</h2>
    <p>Send written feedback to the worker before spending anything on Telegraph verification.</p>
    <label>Requested changes<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} minLength={10} maxLength={2000} rows={4} placeholder="Describe the exact change or missing evidence." /></label>
    <button type="button" disabled={pending || feedback.trim().length < 10} onClick={submit}>{pending ? "Signing feedback…" : "Request changes"}<span>→</span></button>
    {error ? <p className={styles.formError} role="alert">{error}</p> : null}
  </section>;
}
