import Link from "next/link";
import type { Pact } from "@/features/jobs/application/pact-store";
import { databaseConfigured, withPactStoreRead } from "@/app/app/_lib/pact-data";
import { getPolicyPack } from "@/features/policies/domain/policy-pack";
import styles from "../workspace.module.css";

export const dynamic = "force-dynamic";

function shortHash(value?: string): string {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "not funded";
}

export default async function PactsPage() {
  let pacts: readonly Pact[] = [];
  let available = databaseConfigured();
  if (available) {
    try {
      pacts = await withPactStoreRead((store) => store.listPacts(100));
    } catch {
      available = false;
    }
  }

  return <>
    <header className={styles.workspaceHeader}>
      <div><p>Agreements</p><h1>Pacts</h1></div>
      <Link href="/app/jobs/new">Create a pact <span>→</span></Link>
    </header>
    <section className={styles.activity} aria-label="All pacts">
      <div className={styles.sectionTitle}><div><p>Settlement lifecycle</p><h2>All pacts</h2></div></div>
      {pacts.map((pact) => <div className={styles.activityRow} key={pact.id}>
        <span className={pact.status === "RELEASED" ? styles.release : styles.hold}>{pact.status}</span>
        <Link href={`/app/jobs/${pact.id}`}>{pact.title}</Link>
        <code>{getPolicyPack(pact.policyPackId).name} · {shortHash(pact.fundingTransactionHash)}</code>
        <time dateTime={pact.createdAt}>{new Date(pact.createdAt).toISOString().slice(0, 10)}</time>
      </div>)}
      {pacts.length === 0 ? <div className={styles.emptyState}>
        <p>{available ? "No pact has been created yet." : "Persistence is currently unavailable."}</p>
        <Link href="/app/jobs/new">Create the first pact →</Link>
      </div> : null}
    </section>
  </>;
}
