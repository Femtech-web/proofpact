import Link from "next/link";
import { IntentStatus } from "@/features/verification/ui/intent-status";
import styles from "./workspace.module.css";

export default function WorkspacePage() {
  return (
    <>
      <header className={styles.workspaceHeader}><div><p>Settlement workspace</p><h1>Outcome control</h1></div><Link href="/app/jobs/new">Create a pact <span>→</span></Link></header>
      <section className={styles.summaryGrid} aria-label="Workspace summary">
        <article><span>Locked value</span><strong>$2,400</strong><small>3 active pacts</small></article>
        <article><span>Pending verification</span><strong>01</strong><small>4 required intents</small></article>
        <article><span>Released by proof</span><strong>07</strong><small>all receipts replayable</small></article>
      </section>
      <section className={styles.focusGrid}>
        <article className={styles.activePact}>
          <div className={styles.eyebrow}><span>Active pact · Secure delivery pack</span><b>VERIFYING</b></div>
          <h2>Patch and deploy<br />authentication fix</h2>
          <p>Worker submitted commit <code>9f3c2a1</code> and a Base Sepolia deployment for independent verification.</p>
          <dl><div><dt>Reward</dt><dd>800 USDC</dd></div><div><dt>Milestone</dt><dd>Security release</dd></div><div><dt>Settlement</dt><dd>Locked</dd></div></dl>
          <Link href="/app/jobs/pact-7d31">Review evidence <span>→</span></Link>
        </article>
        <article className={styles.verificationPanel}>
          <div className={styles.eyebrow}><span>Telegraph checks</span><b>3 / 4</b></div>
          <ul>
            <IntentStatus intent="FRAUD_DETECTION" status="ready" />
            <IntentStatus intent="CVE_LOOKUP" status="ready" />
            <IntentStatus intent="URL_SCAN" status="ready" />
            <IntentStatus intent="SSL_VERIFICATION" status="waiting" />
          </ul>
          <p>Payment stays locked until every required intent has conclusive evidence from unique Miners.</p>
        </article>
      </section>
      <section className={styles.activity}>
        <div className={styles.sectionTitle}><div><p>Audit trail</p><h2>Recent outcomes</h2></div><Link href="/app/receipts/demo">View all receipts</Link></div>
        <div className={styles.activityRow}><span className={styles.release}>Released</span><strong>API rate-limit remediation</strong><code>0xb81a…92c4</code><time>18 min ago</time></div>
        <div className={styles.activityRow}><span className={styles.hold}>Held</span><strong>Marketplace checkout deployment</strong><code>0x69d0…102e</code><time>2 hr ago</time></div>
      </section>
    </>
  );
}
