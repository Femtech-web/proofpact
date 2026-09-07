import { notFound } from "next/navigation";
import Link from "next/link";
import { withPactStoreRead } from "@/app/app/_lib/pact-data";
import { getConfirmedSettlementTransaction } from "@/infrastructure/persistence/postgres-settlement-event-store";
import styles from "../../workspace.module.css";

export const dynamic = "force-dynamic";

type RecordView = Readonly<{ intent: string; verdict: string; confidence: number; miner: string }>;

function payloadRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function receiptRecords(payload: unknown): readonly RecordView[] {
  const records = payloadRecord(payload)?.records;
  if (!Array.isArray(records)) return [];
  return records.flatMap((entry) => {
    const value = payloadRecord(entry);
    if (!value || typeof value.intent !== "string" || typeof value.verdict !== "string") return [];
    return [{
      intent: value.intent,
      verdict: value.verdict,
      confidence: typeof value.confidence === "number" ? value.confidence : 0,
      miner: typeof value.miner_name === "string" ? value.miner_name : String(value.miner_id ?? "unknown"),
    }];
  });
}

const DECISION_COPY = {
  RELEASE: "Every required check passed. This receipt can authorize release, but funds move only after the Base settlement transaction confirms.",
  RETRY: "Verification did not obtain every required answer. The worker has not failed; the requester may retry the same signed evidence.",
  HOLD: "At least one check found a delivery problem. Funds remain locked while the requester asks the worker for changes.",
  REJECT: "Independent fraud intelligence found material risk. Funds remain locked and this delivery cannot settle.",
} as const;

export default async function ReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const [receipt, confirmedSettlement] = await Promise.all([
    withPactStoreRead((store) => store.getReceipt(receiptId)),
    databaseUrl ? getConfirmedSettlementTransaction(databaseUrl, receiptId) : Promise.resolve(undefined),
  ]);
  if (!receipt) notFound();
  const records = receiptRecords(receipt.payload);
  return <section className={styles.detailPage}>
    <p>REPLAYABLE RECEIPT</p><h1>{receipt.id}</h1>
    <div className={styles.receiptSummary}>
      <code>decision      {receipt.decision}</code>
      <code>receipt_hash  {receipt.receiptHash}</code>
      <code>artifact      {receipt.artifactHash}</code>
      <code>settlement    {confirmedSettlement ?? receipt.settlementTransactionHash ?? "NOT CONFIRMED"}</code>
    </div>
    <div className={styles.decisionBanner}>
      <span>What this means</span>
      <strong>{receipt.decision}</strong>
      <p>{DECISION_COPY[receipt.decision]}</p>
      <Link href={`/app/jobs/${receipt.pactId}`}>Return to pact →</Link>
    </div>
    <h2>Independent verification</h2>
    <p>These are the paid Miner answers used by policy. Replay reads the immutable payload without paying or executing again.</p>
    <dl className={styles.metadataGrid}>
      {records.map((record) => <div key={`${record.intent}-${record.miner}`}>
        <dt>{record.intent}</dt>
        <dd>{record.verdict} · {(record.confidence * 100).toFixed(0)}% · {record.miner}</dd>
      </div>)}
      {records.length === 0 ? <div><dt>No answer records</dt><dd>The paid route stopped before a complete Miner answer could be safely recorded.</dd></div> : null}
    </dl>
    <h2>Technical evidence</h2>
    <p>Raw commitments and bounded response evidence are retained below for audit and replay.</p>
    <pre className={styles.evidenceJson}>{JSON.stringify(receipt.payload, null, 2)}</pre>
  </section>;
}
