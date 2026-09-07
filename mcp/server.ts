#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPostgresPactStore } from "../infrastructure/persistence/postgres-pact-store";
import { getConfirmedSettlementTransaction } from "../infrastructure/persistence/postgres-settlement-event-store";
import { POLICY_PACKS } from "../features/policies/domain/policy-pack";
import { asStructuredContent, createProofPactMcpApplication } from "./application";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const store = createPostgresPactStore(databaseUrl);
const app = createProofPactMcpApplication({
  store,
  escrowAddress: process.env.PROOFPACT_ESCROW_ADDRESS,
  appBaseUrl: process.env.PROOFPACT_APP_URL ?? "http://localhost:3000",
  getConfirmedSettlement: (receiptId) => getConfirmedSettlementTransaction(databaseUrl, receiptId),
});
const server = new McpServer({ name: "proofpact", version: "0.1.0" });

function result(value: unknown) {
  const structuredContent = asStructuredContent(value);
  return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
}

server.registerTool("list_policy_packs", {
  title: "List ProofPact policy packs",
  description: "List versioned work-verification policies and their required Telegraph intents. Read-only.",
  inputSchema: {},
}, async () => result({ policyPacks: app.listPolicyPacks() }));

server.registerTool("create_pact_draft", {
  title: "Create a pact draft",
  description: "Idempotently create an unfunded pact. This does not sign a transaction or lock funds.",
  inputSchema: {
    idempotencyKey: z.string().min(8).max(200),
    requesterAddress: z.string(),
    workerAddress: z.string(),
    policyPackId: z.enum(POLICY_PACKS.map((pack) => pack.id) as [typeof POLICY_PACKS[number]["id"], ...typeof POLICY_PACKS[number]["id"][]]),
    title: z.string().min(3).max(200),
    acceptanceCriteria: z.string().min(20).max(5_000),
    rewardUsdc: z.string(),
  },
}, async (input) => result(await app.createPactDraft(input)));

server.registerTool("get_pact", {
  title: "Get pact state",
  description: "Read a pact with its latest submission, decision receipt, change request, and web URL.",
  inputSchema: { pactId: z.string().min(1).max(128) },
}, async ({ pactId }) => result(await app.getPact(pactId)));

server.registerTool("prepare_funding", {
  title: "Prepare pact funding",
  description: "Build exact Base Sepolia USDC approval and escrow transaction data. Never signs or broadcasts.",
  inputSchema: {
    pactId: z.string().min(1).max(128),
    refundAfter: z.number().int().positive().optional().describe("Optional Unix timestamp; defaults to 30 days from now."),
  },
}, async ({ pactId, refundAfter }) => result(await app.prepareFunding(pactId, refundAfter)));

server.registerTool("prepare_worker_submission", {
  title: "Prepare worker evidence",
  description: "Validate Secure Delivery evidence and return the exact gasless message for the recorded worker to sign. Does not submit or pay.",
  inputSchema: {
    pactId: z.string().min(1).max(128),
    repositoryUrl: z.string().url(),
    commitSha: z.string().min(7).max(64),
    deploymentUrl: z.string().url(),
    claimedRemediation: z.string().min(20).max(2_000),
    nonce: z.string().min(8).max(100).optional(),
    deadline: z.number().int().positive().optional(),
  },
}, async (input) => result(await app.prepareWorkerSubmission(input)));

server.registerTool("estimate_verification", {
  title: "Estimate Telegraph verification",
  description: "Return required intents, expected first-pass cost, retry bound, and hard spend ceiling. Does not route or pay.",
  inputSchema: { pactId: z.string().min(1).max(128) },
}, async ({ pactId }) => result(await app.estimateVerification(pactId)));

server.registerTool("prepare_verification_authorization", {
  title: "Prepare verification authorization",
  description: "Return a short-lived, submission-bound requester message with a 0.12 USDC hard ceiling. Does not start paid verification.",
  inputSchema: {
    pactId: z.string().min(1).max(128),
    nonce: z.string().min(8).max(128).optional(),
    deadline: z.number().int().positive().optional(),
  },
}, async ({ pactId, nonce, deadline }) => result(await app.prepareVerificationAuthorization(pactId, nonce, deadline)));

server.registerTool("get_receipt", {
  title: "Get a ProofPact receipt",
  description: "Read an immutable decision receipt, settlement evidence, and replay result.",
  inputSchema: { receiptId: z.string().min(1).max(128) },
}, async ({ receiptId }) => result(await app.getReceipt(receiptId)));

server.registerTool("replay_receipt", {
  title: "Replay receipt integrity",
  description: "Recompute the immutable payload hash without routing, paying, signing, or executing.",
  inputSchema: { receiptId: z.string().min(1).max(128) },
}, async ({ receiptId }) => result(await app.replayReceipt(receiptId)));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("ProofPact MCP server ready on stdio");

const shutdown = async () => {
  await server.close();
  await store.close();
};
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
