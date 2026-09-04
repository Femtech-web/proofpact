import { POLICY_PACKS } from "@/features/policies/domain/policy-pack";
import styles from "../../workspace.module.css";

export default function NewPactPage() {
  return (
    <section className={styles.formPage}>
      <header><p>New agreement</p><h1>Create a verifiable pact</h1><span>Choose the policy pack that matches the work, then define its objective milestone. ProofPact keeps settlement locked until the pack&apos;s ranked evidence clears policy.</span></header>
      <form className={styles.pactForm}>
        <label>Policy pack
          <select name="policyPack" defaultValue="secure-delivery">
            {POLICY_PACKS.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} — {pack.purpose}</option>)}
          </select>
        </label>
        <label>Milestone title<input name="title" placeholder="Patch and deploy the authentication fix" /></label>
        <label>Acceptance criteria<textarea name="criteria" rows={5} placeholder="CVE is remediated, deployment is reachable over valid TLS, URL scan passes, and fraud checks find no manipulation." /></label>
        <div><label>Reward (USDC)<input name="reward" inputMode="decimal" placeholder="800" /></label><label>Worker address<input name="worker" placeholder="0x…" /></label></div>
        <fieldset><legend>Secure delivery pack · required Telegraph intelligence</legend><label><input type="checkbox" defaultChecked disabled /> FRAUD_DETECTION</label><label><input type="checkbox" defaultChecked disabled /> CVE_LOOKUP</label><label><input type="checkbox" defaultChecked disabled /> URL_SCAN</label><label><input type="checkbox" defaultChecked disabled /> SSL_VERIFICATION</label></fieldset>
        <button type="button">Review and fund <span>→</span></button>
      </form>
    </section>
  );
}
