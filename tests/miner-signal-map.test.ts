import assert from "node:assert/strict";
import test from "node:test";
import { fetchMinerSignalMap } from "../infrastructure/telegraph/miner-signal-map";

test("loads only usable declared Miner mappings from the free catalog", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ miners: [
    { id: 42, signal_mapping: { label_field: "assessment.verdict", confidence_field: "assessment.confidence" } },
    { id: "43", signal_mapping: {} },
  ] }), { status: 200, headers: { "content-type": "application/json" } });
  const mappings = await fetchMinerSignalMap(
    "https://engine.example.com",
    "FRAUD_DETECTION",
    AbortSignal.timeout(1_000),
    fetchImpl,
  );
  assert.deepEqual(mappings.get("42"), {
    labelField: "assessment.verdict",
    confidenceField: "assessment.confidence",
  });
  assert.equal(mappings.has("43"), false);
});
