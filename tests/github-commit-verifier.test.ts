import assert from "node:assert/strict";
import test from "node:test";
import { verifyGithubCommit } from "../infrastructure/source/github-commit-verifier";

const input = {
  pactId: "pact",
  requesterAddress: "0x1111111111111111111111111111111111111111",
  workerAddress: "0x2222222222222222222222222222222222222222",
  rewardUsdc: 1,
  repositoryUrl: "https://github.com/Femtech-web/commitra",
  commitSha: "6c401d8408d9b7bf65764e0d013a352059da71f1",
  deploymentUrl: "https://commitra.vercel.app",
  claimedRemediation: "Reject credential-bearing local model URLs and add regression coverage.",
} as const;

test("binds direct GitHub evidence to the exact repository, commit, and claim", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    sha: input.commitSha,
    html_url: `${input.repositoryUrl}/commit/${input.commitSha}`,
    commit: { message: "Reject credential-bearing local model URL" },
    files: [{ filename: "tests/settings.test.ts", patch: "add regression coverage for local model URLs" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  const proof = await verifyGithubCommit(input, AbortSignal.timeout(1_000), fetchImpl);
  assert.equal(proof.commitSha, input.commitSha);
  assert.ok(proof.claimTermsMatched.includes("credential"));
  assert.match(proof.responseHash, /^0x[0-9a-f]{64}$/);
});

test("rejects a mismatched commit and unsupported repository host", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    sha: "a".repeat(40),
    html_url: `${input.repositoryUrl}/commit/${"a".repeat(40)}`,
    commit: { message: "unrelated" },
    files: [],
  }), { status: 200 });
  await assert.rejects(() => verifyGithubCommit(input, AbortSignal.timeout(1_000), fetchImpl), /does not match/);
  await assert.rejects(() => verifyGithubCommit({ ...input, repositoryUrl: "https://gitlab.com/example/project" }, AbortSignal.timeout(1_000), fetchImpl), /public GitHub/);
});
