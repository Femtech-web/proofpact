import "server-only";

import { createHash } from "node:crypto";
import type { SecureDeliveryFraudInput } from "@/features/verification/application/fraud-verification";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const STOP_WORDS = new Set([
  "added", "and", "changes", "commit", "completed", "deployed", "existing", "for", "from",
  "hardened", "preserving", "reviewed", "submitted", "the", "this", "while", "with", "work",
]);

export type SourceCommitProof = Readonly<{
  provider: "GITHUB";
  repository: string;
  commitSha: string;
  permalink: string;
  observedAt: string;
  responseHash: `0x${string}`;
  claimTermsMatched: readonly string[];
}>;

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/)
    .map((term) => term.endsWith("s") && term.length > 4 ? term.slice(0, -1) : term)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)));
}

async function boundedText(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > MAX_RESPONSE_BYTES) throw new Error("GitHub commit evidence exceeded 1 MiB");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("GitHub commit evidence exceeded 1 MiB");
  return text;
}

export async function verifyGithubCommit(
  input: SecureDeliveryFraudInput,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceCommitProof> {
  const repositoryUrl = new URL(input.repositoryUrl);
  if (repositoryUrl.protocol !== "https:" || repositoryUrl.hostname.toLowerCase() !== "github.com") {
    throw new Error("Secure Delivery currently requires a public GitHub repository for direct source proof");
  }
  const segments = repositoryUrl.pathname.split("/").filter(Boolean);
  if (segments.length < 2) throw new Error("GitHub repository URL must identify an owner and repository");
  const owner = segments[0]!;
  const repositoryName = segments[1]!.replace(/\.git$/i, "");
  const expectedSha = input.commitSha.trim().toLowerCase();
  const apiUrl = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/commits/${expectedSha}`);
  const response = await fetchImpl(apiUrl, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "ProofPact/1.0",
      "x-github-api-version": "2022-11-28",
    },
    signal,
  });
  const body = await boundedText(response);
  if (!response.ok) throw new Error(`GitHub could not verify the submitted commit (HTTP ${response.status})`);
  let value: unknown;
  try { value = JSON.parse(body) as unknown; } catch { throw new Error("GitHub returned invalid commit evidence"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub returned invalid commit evidence");
  const commit = value as Record<string, unknown>;
  const actualSha = typeof commit.sha === "string" ? commit.sha.toLowerCase() : "";
  const expectedPermalink = `https://github.com/${owner}/${repositoryName}/commit/${actualSha}`.toLowerCase();
  const actualPermalink = typeof commit.html_url === "string" ? commit.html_url.replace(/\/$/, "").toLowerCase() : "";
  if (!actualSha.startsWith(expectedSha) || actualPermalink !== expectedPermalink) {
    throw new Error("GitHub commit evidence does not match the submitted repository and SHA");
  }
  const commitRecord = commit.commit && typeof commit.commit === "object" && !Array.isArray(commit.commit)
    ? commit.commit as Record<string, unknown>
    : {};
  const files = Array.isArray(commit.files) ? commit.files : [];
  const corpus = [
    typeof commitRecord.message === "string" ? commitRecord.message : "",
    ...files.flatMap((file) => {
      if (!file || typeof file !== "object" || Array.isArray(file)) return [];
      const entry = file as Record<string, unknown>;
      return [entry.filename, entry.patch].filter((item): item is string => typeof item === "string");
    }),
  ].join("\n");
  const claimTerms = terms(input.claimedRemediation);
  const sourceTerms = terms(corpus);
  const matched = [...claimTerms].filter((term) => sourceTerms.has(term)).sort();
  if (matched.length < Math.min(2, claimTerms.size)) {
    throw new Error("The verified commit does not contain enough evidence for the remediation claim");
  }
  return Object.freeze({
    provider: "GITHUB",
    repository: `${owner}/${repositoryName}`,
    commitSha: actualSha,
    permalink: actualPermalink,
    observedAt: new Date().toISOString(),
    responseHash: `0x${createHash("sha256").update(body).digest("hex")}`,
    claimTermsMatched: Object.freeze(matched),
  });
}
