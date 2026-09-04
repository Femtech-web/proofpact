"use client";

import styles from "./workspace.module.css";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className={styles.statePage}><p>ProofPact could not load this state.</p><button onClick={reset}>Try again</button></div>;
}
