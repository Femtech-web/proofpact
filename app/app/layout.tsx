import Link from "next/link";
import { WorkspaceNav } from "./workspace-nav";
import { WalletGate } from "./wallet-gate";
import styles from "./workspace.module.css";

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Link className={styles.workspaceBrand} href="/"><span>P</span>PROOF/PACT</Link>
          <WorkspaceNav />
          <div className={styles.networkState}><i /> Base Sepolia<br /><small>Telegraph verification</small></div>
        </aside>
        <main className={styles.workspace}>{children}</main>
        <WalletGate />
      </div>
  );
}
