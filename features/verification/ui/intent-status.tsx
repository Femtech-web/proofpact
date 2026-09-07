import type { VerificationIntent } from "@/features/verification/domain/verification";
import styles from "@/app/app/workspace.module.css";

const labels: Record<VerificationIntent, string> = {
  FRAUD_DETECTION: "Fraud & counterparty",
  CVE_LOOKUP: "Vulnerability status",
  URL_SCAN: "Deployment safety",
  SSL_VERIFICATION: "Domain & TLS",
  FACT_CHECK: "Delivery claims",
  WEB_SEARCH: "Repository evidence",
  CONTENT_EXTRACTION: "Commit evidence",
  AGENT_TASK: "Task evidence",
};

export function IntentStatus({ intent, status }: { intent: VerificationIntent; status: "ready" | "waiting" }) {
  return <li><span className={status === "ready" ? styles.readyDot : styles.waitingDot} /><div><strong>{labels[intent]}</strong><small>{intent}</small></div><b>{status}</b></li>;
}
