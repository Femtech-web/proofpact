import Link from "next/link";
import { POLICY_PACKS } from "@/features/policies/domain/policy-pack";
import styles from "../workspace.module.css";

export default function PolicyPacksPage() {
  return (
    <section className={styles.policyPage}>
      <header>
        <div><p>Verification library</p><h1>Policy packs</h1></div>
        <span>Each pack turns a category of work into explicit evidence, Telegraph intelligence, deterministic outcomes, and settlement authority.</span>
      </header>
      <div className={styles.packGrid}>
        {POLICY_PACKS.map((pack) => {
          const isLive = pack.id === "secure-delivery";
          return (
            <article key={pack.id} className={isLive ? styles.livePack : undefined}>
              <div className={styles.eyebrow}><span>{isLive ? "Launch pack" : "Preview"}</span><b>{pack.requiredIntents.length} intents</b></div>
              <h2>{pack.name}</h2>
              <p>{pack.purpose}</p>
              <ul>{pack.requiredIntents.map((intent) => <li key={intent}>{intent}</li>)}</ul>
              {isLive ? <Link href="/app/jobs/new">Create with this pack →</Link> : <small>Activates after coverage and evidence release gates pass.</small>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
