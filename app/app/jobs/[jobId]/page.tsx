import Link from "next/link";
import styles from "../../workspace.module.css";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <section className={styles.detailPage}><p>PACT / {jobId.toUpperCase()}</p><h1>Patch and deploy authentication fix</h1><div className={styles.decisionBanner}><span>Current decision</span><strong>HOLD</strong><p>Settlement remains locked while SSL verification is inconclusive.</p></div><h2>Evidence bundle</h2><p>The production implementation will render Miner identities, signal hashes, x402 costs, attempts, normalized verdicts, and artifact commitments here.</p><Link href={`/app/receipts/${jobId}`}>Open replayable receipt →</Link></section>;
}
