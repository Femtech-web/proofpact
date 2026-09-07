import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMinerProse } from "../features/verification/application/prose-normalizer";

test("translates Miner prose through a fenced JSON-only model response", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  try {
    const result = await normalizeMinerProse(
      "URL_SCAN",
      "The live scan found no malicious redirects and reports the URL as safe.",
      AbortSignal.timeout(1_000),
      async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
        assert.match(request.messages[0]!.content, /Do not add facts/);
        assert.match(request.messages[1]!.content, /<miner_answer>/);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ verdict: "PASS", confidence: 0.91 }) } }],
        }), { status: 200 });
      },
    );
    assert.deepEqual(result, { verdict: "PASS", confidence: 0.91 });
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});

test("abstains when Groq is not configured", async () => {
  const previous = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    assert.equal(await normalizeMinerProse("FRAUD_DETECTION", "safe", AbortSignal.timeout(1_000)), undefined);
  } finally {
    if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  }
});

test("bounds oversized Miner prose instead of silently abandoning normalization", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  try {
    const result = await normalizeMinerProse(
      "URL_SCAN",
      `The URL is safe. ${"x".repeat(20_000)} No malicious redirects were found.`,
      AbortSignal.timeout(1_000),
      async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
        assert.ok(request.messages[1]!.content.length < 4_100);
        assert.match(request.messages[1]!.content, /bounded middle omitted/);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ verdict: "PASS", confidence: 0.9 }) } }],
        }), { status: 200 });
      },
    );
    assert.deepEqual(result, { verdict: "PASS", confidence: 0.9 });
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});
