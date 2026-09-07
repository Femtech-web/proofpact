import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = Object.fromEntries(Object.entries(process.env).flatMap(([key, value]) => value === undefined ? [] : [[key, value]]));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--conditions=react-server", "--import", "tsx", "mcp/server.ts"],
  cwd: process.cwd(),
  env,
  stderr: "pipe",
});
const client = new Client({ name: "proofpact-mcp-smoke", version: "0.1.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expected = [
    "list_policy_packs",
    "create_pact_draft",
    "get_pact",
    "prepare_funding",
    "prepare_worker_submission",
    "estimate_verification",
    "prepare_verification_authorization",
    "get_receipt",
    "replay_receipt",
  ];
  const names = new Set(tools.tools.map((tool) => tool.name));
  for (const name of expected) {
    if (!names.has(name)) throw new Error(`Missing MCP tool: ${name}`);
  }
  const response = await client.callTool({ name: "list_policy_packs", arguments: {} });
  if (response.isError || !response.structuredContent) throw new Error("Policy-pack MCP call failed");
  const receiptId = process.env.PROOFPACT_MCP_SMOKE_RECEIPT_ID?.trim();
  let receiptCall = "skipped";
  if (receiptId) {
    const receipt = await client.callTool({ name: "get_receipt", arguments: { receiptId } });
    if (receipt.isError || !receipt.structuredContent) throw new Error("Receipt MCP call failed");
    const structuredReceipt = receipt.structuredContent as Record<string, unknown>;
    if (typeof structuredReceipt.settlementTransactionHash !== "string") {
      throw new Error("Confirmed settlement projection was not returned through MCP");
    }
    receiptCall = "passed";
  }
  console.log(JSON.stringify({ ok: true, tools: tools.tools.length, policyPackCall: "passed", receiptCall }, null, 2));
} finally {
  await client.close();
}
