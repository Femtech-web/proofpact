"use client";

import { useActionState, useState } from "react";
import { useAccount } from "wagmi";
import { createPactAction } from "./actions";
import styles from "../../workspace.module.css";
import { POLICY_PACKS, type PolicyPackId } from "@/features/policies/domain/policy-pack";

export function PactForm({ idempotencyKey, initialPolicyPack = "secure-delivery" }: Readonly<{
  idempotencyKey: string;
  initialPolicyPack?: PolicyPackId;
}>) {
  const [state, action, pending] = useActionState(createPactAction, {});
  const { address } = useAccount();
  const [policyPackId, setPolicyPackId] = useState<PolicyPackId>(initialPolicyPack);
  const policyPack = POLICY_PACKS.find((pack) => pack.id === policyPackId) ?? POLICY_PACKS[0];
  return (
    <form action={action} className={styles.pactForm}>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <label>Policy pack
        <select name="policyPack" value={policyPackId} onChange={(event) => setPolicyPackId(event.target.value as PolicyPackId)}>
          {POLICY_PACKS.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} — {pack.purpose}</option>)}
        </select>
      </label>
      <label>Milestone title<input name="title" required minLength={3} maxLength={200} placeholder="Patch and deploy the authentication fix" /></label>
      <label>Acceptance criteria<textarea name="criteria" required minLength={20} maxLength={5000} rows={5} placeholder="CVE is remediated, deployment is reachable over valid TLS, URL scan passes, and fraud checks find no manipulation." /></label>
      <div>
        <label>Reward (USDC)<input name="reward" required inputMode="decimal" placeholder="800" /></label>
        <label>Requester address<input name="requester" required value={address ?? ""} readOnly placeholder="Connect a wallet" /></label>
      </div>
      <label>Worker address<input name="worker" required placeholder="0x…" /></label>
      <fieldset><legend>Required Telegraph intelligence</legend>{policyPack.requiredIntents.map((intent) => <label key={intent}><input type="checkbox" checked readOnly /> {intent}</label>)}</fieldset>
      <p className={styles.formNote}>This creates an idempotent draft. It does not sign a wallet transaction or claim that funds are locked.</p>
      {state.error ? <p className={styles.formError} role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Creating draft…" : "Create pact draft"}<span>→</span></button>
    </form>
  );
}
