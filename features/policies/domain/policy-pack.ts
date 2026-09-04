import type { VerificationIntent } from "@/features/verification/domain/verification";

export type PolicyPackId =
  | "secure-delivery"
  | "research"
  | "data-work"
  | "content"
  | "growth"
  | "protocol-operations"
  | "agent-services";

export type PolicyPack = Readonly<{
  id: PolicyPackId;
  name: string;
  purpose: string;
  requiredIntents: readonly VerificationIntent[];
  evidenceExamples: readonly string[];
}>;

export const POLICY_PACKS: readonly PolicyPack[] = [
  {
    id: "secure-delivery",
    name: "Secure delivery",
    purpose: "Verify a software fix and its deployed outcome.",
    requiredIntents: ["FRAUD_DETECTION", "CVE_LOOKUP", "URL_SCAN", "SSL_VERIFICATION"],
    evidenceExamples: ["source commit", "deployment URL", "vulnerability identifier"],
  },
  {
    id: "research",
    name: "Research",
    purpose: "Verify sourced findings, factual claims, and delivery integrity.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["research brief", "source index", "claim ledger"],
  },
  {
    id: "data-work",
    name: "Data work",
    purpose: "Verify a dataset, transformation, or labeling milestone.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["dataset commitment", "schema", "quality report"],
  },
  {
    id: "content",
    name: "Content",
    purpose: "Verify factual, original, policy-compliant content delivery.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["content artifact", "source references", "publishing target"],
  },
  {
    id: "growth",
    name: "Growth",
    purpose: "Verify campaign delivery without paying for fabricated activity.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "URL_SCAN"],
    evidenceExamples: ["campaign URL", "attribution report", "result commitment"],
  },
  {
    id: "protocol-operations",
    name: "Protocol operations",
    purpose: "Verify operational or security work before treasury settlement.",
    requiredIntents: ["FRAUD_DETECTION", "CVE_LOOKUP", "URL_SCAN", "SSL_VERIFICATION"],
    evidenceExamples: ["change proposal", "transaction simulation", "service endpoint"],
  },
  {
    id: "agent-services",
    name: "Agent-to-agent services",
    purpose: "Let one agent commission and settle another agent's work.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["service request", "machine-readable deliverable", "counterparty identity"],
  },
] as const;

export function getPolicyPack(id: PolicyPackId): PolicyPack {
  const pack = POLICY_PACKS.find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`Unknown policy pack: ${id}`);
  return pack;
}
