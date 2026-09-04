import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSettlement } from "../features/settlement/domain/evaluate-settlement";
import type { VerificationSignal } from "../features/verification/domain/verification";
import { POLICY_PACKS } from "../features/policies/domain/policy-pack";

function signal(intent: VerificationSignal["intent"], minerId: string, verdict: VerificationSignal["verdict"] = "PASS"): VerificationSignal {
  return { intent, minerId, verdict, confidence: 0.95, observedAt: "2026-09-04T00:00:00.000Z", signalHash: "0xabc" };
}

test("releases only when every core intent, including FRAUD_DETECTION, passes", () => {
  const result = evaluateSettlement([
    signal("FRAUD_DETECTION", "miner-a"),
    signal("CVE_LOOKUP", "miner-b"),
    signal("URL_SCAN", "miner-c"),
    signal("SSL_VERIFICATION", "miner-d"),
  ]);
  assert.equal(result.decision, "RELEASE");
});

test("retries when fraud intelligence is absent", () => {
  const result = evaluateSettlement([
    signal("CVE_LOOKUP", "miner-b"),
    signal("URL_SCAN", "miner-c"),
    signal("SSL_VERIFICATION", "miner-d"),
  ]);
  assert.equal(result.decision, "RETRY");
  assert.deepEqual(result.missingIntents, ["FRAUD_DETECTION"]);
});

test("rejects a conclusive fraud failure", () => {
  const result = evaluateSettlement([signal("FRAUD_DETECTION", "miner-a", "FAIL")]);
  assert.equal(result.decision, "REJECT");
});

test("does not count duplicate Miner identities twice", () => {
  const result = evaluateSettlement([
    signal("FRAUD_DETECTION", "miner-a"),
    signal("CVE_LOOKUP", "MINER-A"),
    signal("URL_SCAN", "miner-c"),
    signal("SSL_VERIFICATION", "miner-d"),
  ]);
  assert.equal(result.decision, "RETRY");
  assert.deepEqual(result.missingIntents, ["CVE_LOOKUP"]);
});

test("every policy pack requires fraud intelligence", () => {
  for (const pack of POLICY_PACKS) {
    assert.ok(pack.requiredIntents.includes("FRAUD_DETECTION"), `${pack.id} must require FRAUD_DETECTION`);
  }
});

test("evaluates evidence against the selected policy pack", () => {
  const result = evaluateSettlement([
    signal("FRAUD_DETECTION", "miner-a"),
    signal("FACT_CHECK", "miner-b"),
    signal("AGENT_TASK", "miner-c"),
  ], "research");
  assert.equal(result.decision, "RELEASE");
});
