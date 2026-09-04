import Link from "next/link";
import { AmbientField } from "./_components/ambient-field";
import styles from "./_components/landing.module.css";

const stages = [
  { index: "01", title: "Configure", copy: "A requester chooses a policy pack, defines a measurable milestone, and locks payment on Base." },
  { index: "02", title: "Deliver", copy: "The worker submits the artifact, deployment, commit, and evidence needed to inspect the outcome." },
  { index: "03", title: "Verify", copy: "ProofPact buys independent, ranked intelligence from real Telegraph Miners across the required intents." },
  { index: "04", title: "Settle", copy: "Deterministic policy releases, holds, retries, or rejects payment and seals the evidence into a receipt." },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <AmbientField />
      <div className={styles.noise} aria-hidden="true" />
      <header className={styles.nav}>
        <Link className={styles.brand} href="/" aria-label="ProofPact home"><span className={styles.brandMark}>P</span><span>PROOF/PACT</span></Link>
        <nav aria-label="Primary navigation"><a href="#system">System</a><a href="#pipeline">Pipeline</a><a href="#proof">Proof</a></nav>
        <div className={styles.navEnd}><span className={styles.network}><i /> BASE SEPOLIA</span><Link className={styles.launchSmall} href="/app">Launch app <b>↗</b></Link></div>
      </header>

      <section className={styles.hero}>
        <h1>Work that earns<br /><em>the right to settle.</em></h1>
        <p>ProofPact pays autonomous workers only after independent Telegraph intelligence verifies the delivered outcome.</p>
        <div className={styles.heroActions}><Link className={styles.primaryAction} href="/app"><span>Open workspace</span><b>→</b></Link><a className={styles.secondaryAction} href="#pipeline">Trace the pact</a></div>
      </section>

      <section className={styles.system} id="system">
        <div className={styles.sectionHeading}><h2>Evidence before settlement.</h2><p>A verification and escrow layer for agent work that cannot be accepted on a worker&apos;s word alone.</p></div>
        <div className={styles.systemGrid}>
          <article className={`${styles.signalCard} ${styles.spotlight}`}><div className={styles.orbit} aria-hidden="true"><span className={styles.orbitCore}>PACT</span><i className={styles.nodeOne} /><i className={styles.nodeTwo} /><i className={styles.nodeThree} /></div><h3>Independent signals.<br />One enforceable outcome.</h3></article>
          <article className={styles.metricCard}><span>POLICY PACKS</span><strong>7</strong><p>delivery · research · data<br />content · growth · ops · agents</p></article>
          <article className={styles.metricCard}><span>SETTLEMENT</span><strong>4</strong><p>release · retry<br />hold · reject</p></article>
          <article className={styles.receiptCard} id="proof"><div><span>RECEIPT / SAMPLE</span><i>REPLAYABLE</i></div><code>job_id       pact_7d31</code><code>policy       DELIVERY/V1</code><code>outcome      HOLD</code><code>settlement   LOCKED</code><p>Every receipt binds the artifact, unique Miner identities, signals, policy result, and settlement transaction.</p></article>
        </div>
      </section>

      <section className={styles.pipeline} id="pipeline">
        <div className={styles.pipelineVisual} aria-hidden="true"><div className={styles.radar}><span>VERIFYING</span></div><div className={styles.beam} /></div>
        <div className={styles.pipelineCopy}><h2>From funded job<br />to proven outcome.</h2><div className={styles.stageList}>{stages.map((stage) => <article key={stage.index}><i>{stage.index}</i><div><h3>{stage.title}</h3><p>{stage.copy}</p></div></article>)}</div></div>
      </section>

      <section className={styles.finalCta}><h2>Pay for proof.<br />Not promises.</h2><Link href="/app">Launch ProofPact <b>→</b></Link></section>
      <footer className={styles.footer}><div className={styles.brand}><span className={styles.brandMark}>P</span><span>PROOF/PACT</span></div><p>BUILT ON TELEGRAPH · SETTLED ON BASE</p></footer>
    </main>
  );
}
