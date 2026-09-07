import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  buildFundingPlan,
} from "../features/funding/domain/funding-plan";

const ESCROW = "0xda056735D5B5D4253a8c8E9B5d9AC73285F27314";
const input = {
  externalPactId: "e2e-pact-1",
  requesterAddress: "0xcc886a72f79BaEd0098432704a65373F52131c54",
  workerAddress: "0xd04BBA49865f57840D4F03CCf541961906843AF1",
  policyPackId: "secure-delivery",
  policyVersion: "DELIVERY_V1",
  title: "Patch authentication",
  acceptanceCriteria: "The vulnerability is fixed and the deployment passes every required check.",
  rewardUsdc: "800",
  escrowAddress: ESCROW,
  refundAfter: 2_000_000_000,
} as const;

test("builds exact wallet-ready approval and immutable pact funding transactions", () => {
  const plan = buildFundingPlan(input, 1_900_000_000);
  assert.equal(plan.approval.chainId, BASE_SEPOLIA_CHAIN_ID);
  assert.equal(plan.approval.to, BASE_SEPOLIA_USDC);
  assert.equal(plan.funding.to, ESCROW);
  assert.equal(plan.amountBaseUnits, "800000000");
  assert.match(plan.pactId, /^0x[0-9a-f]{64}$/);
  assert.match(plan.termsHash, /^0x[0-9a-f]{64}$/);
  assert.notEqual(plan.pactId, plan.termsHash);
});

test("terms commitment changes when economic or acceptance terms change", () => {
  const baseline = buildFundingPlan(input, 1_900_000_000);
  const changedReward = buildFundingPlan({ ...input, rewardUsdc: "801" }, 1_900_000_000);
  const changedCriteria = buildFundingPlan({ ...input, acceptanceCriteria: `${input.acceptanceCriteria} No exceptions.` }, 1_900_000_000);
  assert.notEqual(baseline.termsHash, changedReward.termsHash);
  assert.notEqual(baseline.termsHash, changedCriteria.termsHash);
});

test("rejects unsafe funding bounds", () => {
  assert.throws(() => buildFundingPlan({ ...input, rewardUsdc: "10000.000001" }, 1_900_000_000));
  assert.throws(() => buildFundingPlan({ ...input, refundAfter: 1_900_000_000 }, 1_900_000_000));
  assert.throws(() => buildFundingPlan({ ...input, workerAddress: input.requesterAddress }, 1_900_000_000));
});
