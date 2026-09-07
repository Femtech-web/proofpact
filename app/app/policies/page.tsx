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
        {POLICY_PACKS.map((pack, index) => {
          return (
            <article key={pack.id} className={index === 0 ? styles.livePack : undefined}>
              <div className={styles.eyebrow}><span>Live policy</span><b>{pack.requiredIntents.length} intents</b></div>
              <h2>{pack.name}</h2>
              <p>{pack.purpose}</p>
              <ul>{pack.requiredIntents.map((intent) => <li key={intent}>{intent}</li>)}</ul>
              <Link href={`/app/jobs/new?pack=${pack.id}`}>Create with this pack →</Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
