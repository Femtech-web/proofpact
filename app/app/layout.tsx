import Link from "next/link";
import styles from "./workspace.module.css";

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.workspaceBrand} href="/"><span>P</span>PROOF/PACT</Link>
        <nav aria-label="Workspace navigation">
          <Link href="/app">Overview</Link>
          <Link href="/app/jobs/new">Create pact</Link>
          <Link href="/app/policies">Policy packs</Link>
          <Link href="/app/receipts/demo">Receipts</Link>
        </nav>
        <div className={styles.networkState}><i /> Base Sepolia<br /><small>Telegraph verification</small></div>
      </aside>
      <main className={styles.workspace}>{children}</main>
    </div>
  );
}
