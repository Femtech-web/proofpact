"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildPolicyWorkerSubmissionMessage } from "@/features/jobs/domain/policy-worker-submission";
import { getPolicyPack, type PolicyPackId } from "@/features/policies/domain/policy-pack";
import { submitWorkerEvidenceAction } from "./actions";
import styles from "../../workspace.module.css";

function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function WorkerSubmissionForm({ pactId, workerAddress, policyPackId }: Readonly<{
  pactId: string;
  workerAddress: string;
  policyPackId: PolicyPackId;
}>) {
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("Sign and submit evidence");
  const [error, setError] = useState("");
  const isWorker = Boolean(address && address.toLowerCase() === workerAddress.toLowerCase());
  const policyPack = getPolicyPack(policyPackId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      if (!address) throw new Error("Connect the worker wallet first.");
      const data = new FormData(event.currentTarget);
      if (!isWorker) {
        throw new Error("The selected wallet is not the worker recorded on this pact.");
      }
      const fields = {
        pactId,
        policyPackId,
        evidence: Object.fromEntries(policyPack.evidenceFields.map((field) => [field.key, formValue(data, field.key)])),
        claimedOutcome: formValue(data, "claimedOutcome"),
        nonce: crypto.randomUUID(),
        deadline: Math.floor(Date.now() / 1000) + 10 * 60,
      };
      const message = buildPolicyWorkerSubmissionMessage(fields);
      setStatus("Awaiting worker signature…");
      const signature = await signMessageAsync({ message });
      setStatus("Verifying worker and saving evidence…");
      const result = await submitWorkerEvidenceAction({ ...fields, signature });
      if (!result.ok) throw new Error(result.error);
      setStatus("Evidence submitted");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence submission failed.");
      setStatus("Sign and submit evidence");
    } finally {
      setPending(false);
    }
  }

  return <section className={styles.workerPanel}>
    <div className={styles.workerPanelHeader}>
      <div><span>Worker handoff</span><h2>Submit completed work</h2></div>
      <p>The recorded worker signs the exact evidence. Submission starts verification; it cannot release payment.</p>
    </div>
    <form onSubmit={submit} className={styles.workerForm}>
      <div className={isWorker ? styles.roleMatch : styles.roleMismatch}>
        <span>Connected signer</span>
        <strong>{address ?? "No wallet connected"}</strong>
        <small>{isWorker ? "Recorded worker · eligible to submit" : `Switch to worker ${workerAddress}`}</small>
      </div>
      {policyPack.evidenceFields.map((field) => <label key={field.key}>{field.label}<input
        name={field.key}
        type={field.key === "commit_sha" ? "text" : "url"}
        required
        {...(field.key === "commit_sha" ? { minLength: 7, maxLength: 64, pattern: "[0-9a-fA-F]{7,64}" } : {})}
        placeholder={field.placeholder}
      /></label>)}
      <label>Outcome claim<textarea name="claimedOutcome" required minLength={20} maxLength={2000} rows={5} placeholder={`Explain exactly how this delivery satisfies the ${policyPack.name} acceptance criteria.`} /></label>
      <p>Signing is gasless. Telegraph payments require a separate, explicit authorization after the evidence is stored.</p>
      <button type="submit" disabled={pending || !isWorker} aria-busy={pending}>{status}<span>→</span></button>
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
    </form>
  </section>;
}
