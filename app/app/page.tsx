import Link from "next/link";
import { IntentStatus } from "@/features/verification/ui/intent-status";
import type { Pact } from "@/features/jobs/application/pact-store";
import { getPolicyPack } from "@/features/policies/domain/policy-pack";
import { databaseConfigured, withPactStoreRead } from "@/app/app/_lib/pact-data";
import styles from "./workspace.module.css";

export const dynamic = "force-dynamic";

const LOCKED_STATUSES = new Set(["FUNDED", "SUBMITTED", "VERIFYING", "HELD", "APPROVED"]);

function shortHash(value?: string): string {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "not funded";
}

export default async function WorkspacePage() {
  let pacts: readonly Pact[] = [];
  let persistenceAvailable = databaseConfigured();
  if (persistenceAvailable) {
    try {
      pacts = await withPactStoreRead((store) => store.listPacts(20));
    } catch {
      persistenceAvailable = false;
    }
  }
  const locked = pacts.filter((pact) => LOCKED_STATUSES.has(pact.status));
  const released = pacts.filter((pact) => pact.status === "RELEASED");
  const pending = pacts.filter((pact) => ["SUBMITTED", "VERIFYING", "APPROVED"].includes(pact.status));
  const lockedValue = locked.reduce((sum, pact) => sum + Number(pact.rewardUsdc), 0);
  const focus = pacts[0];
  const requiredIntents = focus ? getPolicyPack(focus.policyPackId).requiredIntents : [];

  return (
    <>
      <header className={styles.workspaceHeader}><div><p>Settlement workspace</p><h1>Outcome control</h1></div><Link href="/app/jobs/new">Create a pact <span>→</span></Link></header>
      <section className={styles.summaryGrid} aria-label="Workspace summary">
        <article><span>Recorded locked value</span><strong>{lockedValue.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC</strong><small>{locked.length} active pacts</small></article>
        <article><span>Pending verification</span><strong>{String(pending.length).padStart(2, "0")}</strong><small>database-backed workflow state</small></article>
        <article><span>Released on Base</span><strong>{String(released.length).padStart(2, "0")}</strong><small>confirmed settlement only</small></article>
      </section>
      {focus ? <section className={styles.focusGrid}>
          <article className={styles.activePact}>
            <div className={styles.eyebrow}><span>Latest pact · {getPolicyPack(focus.policyPackId).name}</span><b>{focus.status}</b></div>
            <h2>{focus.title}</h2>
            <p>{focus.acceptanceCriteria}</p>
            <dl><div><dt>Reward</dt><dd>{focus.rewardUsdc} USDC</dd></div><div><dt>Policy</dt><dd>{focus.policyVersion}</dd></div><div><dt>Funding</dt><dd>{shortHash(focus.fundingTransactionHash)}</dd></div></dl>
            <Link href={`/app/jobs/${focus.id}`}>Review pact <span>→</span></Link>
          </article>
          <article className={styles.verificationPanel}>
            <div className={styles.eyebrow}><span>Required Telegraph checks</span><b>{requiredIntents.length}</b></div>
            <ul>{requiredIntents.map((intent) => <IntentStatus key={intent} intent={intent} status="waiting" />)}</ul>
            <p>Intent rows remain waiting until persisted Miner evidence exists. No UI placeholder can create release authority.</p>
          </article>
        </section> : <section className={styles.emptyState}>
          <p>{persistenceAvailable ? "No pact has been created yet." : "Persistence is currently unavailable."}</p>
          <Link href="/app/jobs/new">Create the first pact →</Link>
        </section>}
      <section className={styles.activity}>
        <div className={styles.sectionTitle}><div><p>Audit trail</p><h2>Recent pacts</h2></div></div>
        {pacts.slice(0, 8).map((pact) => <div className={styles.activityRow} key={pact.id}>
          <span className={pact.status === "RELEASED" ? styles.release : styles.hold}>{pact.status}</span>
          <Link href={`/app/jobs/${pact.id}`}>{pact.title}</Link>
          <code>{shortHash(pact.fundingTransactionHash)}</code>
          <time dateTime={pact.createdAt}>{new Date(pact.createdAt).toISOString().slice(0, 10)}</time>
        </div>)}
      </section>
    </>
  );
}
