import assert from "node:assert/strict";
import test from "node:test";
import type { Pact, PactStore, Receipt } from "../features/jobs/application/pact-store";
import { canonicalJson, sha256Hex, type JsonValue } from "../shared/json/canonical-json";
import { createProofPactMcpApplication } from "../mcp/application";

const pact: Pact = {
  id: "pact-mcp-1234",
  requesterAddress: "0x1111111111111111111111111111111111111111",
  workerAddress: "0x2222222222222222222222222222222222222222",
  policyPackId: "secure-delivery",
  policyVersion: "DELIVERY_V1",
  title: "Ship the secure release",
  acceptanceCriteria: "The exact committed deployment must pass every required verification check.",
  rewardUsdc: "10",
  chainId: 84_532,
  status: "DRAFT",
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
};

function fakeStore(overrides: Partial<PactStore> = {}): PactStore {
  return {
    createPact: async () => pact,
    getPact: async () => pact,
    listPacts: async () => [pact],
    confirmFunding: async () => pact,
    createSubmission: async () => { throw new Error("unused"); },
    getLatestSubmission: async () => undefined,
    beginVerification: async () => pact,
    completeVerification: async () => { throw new Error("unused"); },
    getReceipt: async () => undefined,
    listReceipts: async () => [],
    getLatestReceiptForPact: async () => undefined,
    createChangeRequest: async () => { throw new Error("unused"); },
    getLatestChangeRequest: async () => undefined,
    ...overrides,
  };
}

test("MCP policy listing exposes all packs without claiming paid proof for all", () => {
  const app = createProofPactMcpApplication({ store: fakeStore() });
  const packs = app.listPolicyPacks();
  assert.equal(packs.length, 7);
  assert.equal(packs.filter((entry) => entry.paidDesignPartnerProof).length, 1);
  assert.ok(packs.every((entry) => entry.requiredIntents.includes("FRAUD_DETECTION")));
});

test("MCP draft creation is idempotency-keyed and never funds", async () => {
  let observed: Parameters<PactStore["createPact"]>[0] | undefined;
  const app = createProofPactMcpApplication({
    store: fakeStore({ createPact: async (input) => { observed = input; return pact; } }),
    appBaseUrl: "https://proofpact.example",
  });
  const result = await app.createPactDraft({
    idempotencyKey: "agent-run-0001",
    requesterAddress: pact.requesterAddress,
    workerAddress: pact.workerAddress,
    policyPackId: "secure-delivery",
    title: pact.title,
    acceptanceCriteria: pact.acceptanceCriteria,
    rewardUsdc: pact.rewardUsdc,
  });
  assert.equal(observed?.idempotencyKey, "agent-run-0001");
  assert.equal(result.pact.status, "DRAFT");
  assert.equal(result.webUrl, "https://proofpact.example/app/jobs/pact-mcp-1234");
});

test("MCP funding preparation returns wallet-ready data without broadcasting", async () => {
  const app = createProofPactMcpApplication({
    store: fakeStore(),
    escrowAddress: "0x3333333333333333333333333333333333333333",
    now: () => new Date("2026-09-07T00:00:00.000Z"),
  });
  const plan = await app.prepareFunding(pact.id);
  assert.equal(plan.requiresWallet, pact.requesterAddress);
  assert.equal(plan.executesAutomatically, false);
  assert.equal(plan.approval.chainId, 84_532);
  assert.equal(plan.funding.to, "0x3333333333333333333333333333333333333333");
});

test("MCP replay verifies immutable payload and reads settlement projection", async () => {
  const payload: JsonValue = { version: 1, decision: "RELEASE", records: [] };
  const receipt: Receipt = {
    id: "receipt-mcp-1234",
    pactId: pact.id,
    submissionId: "submission-mcp-1234",
    runId: "run-mcp-1234",
    receiptHash: sha256Hex(canonicalJson(payload)),
    artifactHash: `0x${"a".repeat(64)}`,
    decision: "RELEASE",
    payload,
    createdAt: "2026-09-07T00:00:00.000Z",
  };
  const settlement = `0x${"b".repeat(64)}` as const;
  const app = createProofPactMcpApplication({
    store: fakeStore({ getReceipt: async () => receipt }),
    getConfirmedSettlement: async () => settlement,
  });
  const replay = await app.replayReceipt(receipt.id);
  assert.equal(replay.hashMatches, true);
  assert.equal(replay.settlementTransactionHash, settlement);
  assert.deepEqual(replay.sideEffects, { routed: false, paid: false, signed: false, executed: false });
});
