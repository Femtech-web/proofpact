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
  version: string;
  evidenceFields: readonly Readonly<{ key: string; label: string; placeholder: string }>[];
}>;

export const POLICY_PACKS: readonly PolicyPack[] = [
  {
    id: "secure-delivery",
    name: "Secure delivery",
    purpose: "Verify a software fix and its deployed outcome.",
    requiredIntents: ["FRAUD_DETECTION", "URL_SCAN", "SSL_VERIFICATION"],
    evidenceExamples: ["source commit", "deployment URL", "vulnerability identifier"],
    version: "DELIVERY_V1",
    evidenceFields: [
      { key: "repository_url", label: "Repository URL", placeholder: "https://github.com/org/project" },
      { key: "commit_sha", label: "Commit SHA", placeholder: "Full hexadecimal Git commit SHA" },
      { key: "deployment_url", label: "Deployment URL", placeholder: "https://app.example.com" },
    ],
  },
  {
    id: "research",
    name: "Research",
    purpose: "Verify sourced findings, factual claims, and delivery integrity.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["research brief", "source index", "claim ledger"],
    version: "RESEARCH_V1",
    evidenceFields: [
      { key: "research_url", label: "Research brief URL", placeholder: "https://docs.example.com/report" },
      { key: "sources_url", label: "Source index URL", placeholder: "https://docs.example.com/sources" },
      { key: "claims_url", label: "Claim ledger URL", placeholder: "https://docs.example.com/claims" },
    ],
  },
  {
    id: "data-work",
    name: "Data work",
    purpose: "Verify a dataset, transformation, or labeling milestone.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["dataset commitment", "schema", "quality report"],
    version: "DATA_V1",
    evidenceFields: [
      { key: "dataset_url", label: "Dataset URL", placeholder: "https://data.example.com/dataset" },
      { key: "schema_url", label: "Schema URL", placeholder: "https://data.example.com/schema" },
      { key: "quality_report_url", label: "Quality report URL", placeholder: "https://data.example.com/quality" },
    ],
  },
  {
    id: "content",
    name: "Content",
    purpose: "Verify factual, original, policy-compliant content delivery.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["content artifact", "source references", "publishing target"],
    version: "CONTENT_V1",
    evidenceFields: [
      { key: "content_url", label: "Content URL", placeholder: "https://example.com/draft" },
      { key: "sources_url", label: "Source references URL", placeholder: "https://example.com/sources" },
      { key: "publication_url", label: "Publishing target URL", placeholder: "https://example.com/published" },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    purpose: "Verify campaign delivery without paying for fabricated activity.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "URL_SCAN"],
    evidenceExamples: ["campaign URL", "attribution report", "result commitment"],
    version: "GROWTH_V1",
    evidenceFields: [
      { key: "campaign_url", label: "Campaign URL", placeholder: "https://example.com/campaign" },
      { key: "attribution_url", label: "Attribution report URL", placeholder: "https://example.com/attribution" },
      { key: "results_url", label: "Results evidence URL", placeholder: "https://example.com/results" },
    ],
  },
  {
    id: "protocol-operations",
    name: "Protocol operations",
    purpose: "Verify operational or security work before treasury settlement.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "URL_SCAN", "SSL_VERIFICATION"],
    evidenceExamples: ["change proposal", "transaction simulation", "service endpoint"],
    version: "OPS_V1",
    evidenceFields: [
      { key: "proposal_url", label: "Change proposal URL", placeholder: "https://governance.example.com/proposal" },
      { key: "simulation_url", label: "Simulation or execution evidence URL", placeholder: "https://example.com/simulation" },
      { key: "service_url", label: "Service endpoint URL", placeholder: "https://service.example.com" },
    ],
  },
  {
    id: "agent-services",
    name: "Agent-to-agent services",
    purpose: "Let one agent commission and settle another agent's work.",
    requiredIntents: ["FRAUD_DETECTION", "FACT_CHECK", "AGENT_TASK"],
    evidenceExamples: ["service request", "machine-readable deliverable", "counterparty identity"],
    version: "AGENT_SERVICE_V1",
    evidenceFields: [
      { key: "request_url", label: "Service request URL", placeholder: "https://example.com/request" },
      { key: "deliverable_url", label: "Deliverable URL", placeholder: "https://example.com/deliverable" },
      { key: "execution_receipt_url", label: "Execution receipt URL", placeholder: "https://example.com/receipt" },
    ],
  },
] as const;

export function getPolicyPack(id: PolicyPackId): PolicyPack {
  const pack = POLICY_PACKS.find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`Unknown policy pack: ${id}`);
  return pack;
}
