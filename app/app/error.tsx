"use client";

import styles from "./workspace.module.css";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className={styles.statePage}>
    <p>ProofPact temporarily lost its data connection.</p>
    <small>No wallet signature, Telegraph payment, or escrow action is triggered by reloading this page.</small>
    <button onClick={reset}>Reconnect</button>
  </div>;
}
