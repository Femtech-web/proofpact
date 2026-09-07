import Link from "next/link";
import { withPactStoreRead } from "@/app/app/_lib/pact-data";
import styles from "../workspace.module.css";

export const dynamic = "force-dynamic";

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export default async function ReceiptsPage() {
  const receipts = await withPactStoreRead((store) => store.listReceipts());
  return <section className={styles.detailPage}>
    <p>IMMUTABLE AUDIT TRAIL</p>
    <h1>Receipts</h1>
    {receipts.length === 0 ? <div className={styles.emptyState}>
      <p>No verification receipt exists yet. A receipt appears only after persisted Miner evidence reaches a deterministic policy decision.</p>
      <Link href="/app">Review active pacts →</Link>
    </div> : <div className={styles.receiptList}>
      {receipts.map((receipt) => <Link key={receipt.id} href={`/app/receipts/${receipt.id}`}>
        <span>{receipt.decision}</span>
        <strong>{shortHash(receipt.receiptHash)}</strong>
        <small>{new Date(receipt.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</small>
      </Link>)}
    </div>}
  </section>;
}
