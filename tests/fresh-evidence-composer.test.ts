import assert from "node:assert/strict";
import test from "node:test";
import { composeFreshEvidence } from "../features/verification/application/fresh-evidence-composer";
import type { Receipt } from "../features/jobs/application/pact-store";

const intents = ["FRAUD_DETECTION", "URL_SCAN", "SSL_VERIFICATION"] as const;
const hashes = new Map(intents.map((intent, index) => [intent, `0x${String(index + 1).repeat(64)}` as `0x${string}`]));
const artifactHash = `0x${"a".repeat(64)}` as `0x${string}`;

function receipt(id: string, intent: typeof intents[number], miner: string, ageMinutes: number): Receipt {
  const observed = new Date(Date.UTC(2026, 8, 7, 15, 0) - ageMinutes * 60_000).toISOString();
  return {
    id, pactId: "pact", submissionId: "submission", runId: id,
    receiptHash: `0x${"b".repeat(64)}`, artifactHash, decision: "RETRY", createdAt: observed,
    payload: {
      policy_pack: "secure-delivery", policy_version: "DELIVERY_V1", required_intents: [...intents],
      records: [{ intent, miner_id: miner, miner_name: miner, verdict: "PASS", confidence: 0.9,
        signal_hash: `0x${"c".repeat(64)}`, raw_response_hash: `0x${"d".repeat(64)}`,
        query_hash: hashes.get(intent)!, cost_usd: 0.01, observed_at: observed }],
    },
  };
}

test("composes matching fresh paid evidence without counting it twice", () => {
  const result = composeFreshEvidence({
    receipts: [receipt("fraud", "FRAUD_DETECTION", "miner-a", 5), receipt("url", "URL_SCAN", "miner-b", 40), receipt("ssl", "SSL_VERIFICATION", "miner-c", 2)],
    submissionId: "submission", artifactHash, policyPackId: "secure-delivery", policyVersion: "DELIVERY_V1",
    requiredIntents: intents, expectedQueryHashes: hashes, now: new Date("2026-09-07T15:00:00.000Z"), maxAgeMs: 60 * 60_000,
  });
  assert.deepEqual(result.records.map((record) => record.intent), intents);
  assert.deepEqual(result.sourceReceiptIds, ["fraud", "url", "ssl"]);
});

test("rejects stale or query-mismatched evidence", () => {
  assert.throws(() => composeFreshEvidence({
    receipts: [receipt("fraud", "FRAUD_DETECTION", "miner-a", 5), receipt("url", "URL_SCAN", "miner-b", 61), receipt("ssl", "SSL_VERIFICATION", "miner-c", 2)],
    submissionId: "submission", artifactHash, policyPackId: "secure-delivery", policyVersion: "DELIVERY_V1",
    requiredIntents: intents, expectedQueryHashes: hashes, now: new Date("2026-09-07T15:00:00.000Z"), maxAgeMs: 60 * 60_000,
  }), /Fresh conclusive evidence/);
});
