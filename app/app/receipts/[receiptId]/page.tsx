import styles from "../../workspace.module.css";

export default async function ReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  return <section className={styles.detailPage}><p>REPLAYABLE RECEIPT</p><h1>{receiptId}</h1><div className={styles.receiptSummary}><code>policy        DELIVERY_V1</code><code>decision      HOLD</code><code>artifact      sha256:7c2a…91e0</code><code>signal_count  4</code><code>settlement    LOCKED</code></div><h2>Independent verification</h2><p>Replay recomputes policy and hashes from persisted evidence without paying Miners again or creating new settlement authority.</p></section>;
}
