"use server";

import { redirect } from "next/navigation";
import { isAddress } from "viem";
import { withPactStore } from "@/app/app/_lib/pact-data";
import { getPolicyPack, type PolicyPackId } from "@/features/policies/domain/policy-pack";

export type CreatePactState = Readonly<{ error?: string }>;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createPactAction(
  _state: CreatePactState,
  formData: FormData,
): Promise<CreatePactState> {
  const idempotencyKey = field(formData, "idempotencyKey");
  const title = field(formData, "title");
  const acceptanceCriteria = field(formData, "criteria");
  const rewardUsdc = field(formData, "reward");
  const requesterAddress = field(formData, "requester");
  const workerAddress = field(formData, "worker");
  const policyPackId = field(formData, "policyPack") as PolicyPackId;
  let policyPack;
  try {
    policyPack = getPolicyPack(policyPackId);
  } catch {
    return { error: "Choose a supported policy pack." };
  }

  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) return { error: "Refresh and try again." };
  if (title.length < 3 || title.length > 200) return { error: "Use a 3–200 character milestone title." };
  if (acceptanceCriteria.length < 20 || acceptanceCriteria.length > 5_000) {
    return { error: "Acceptance criteria must be specific and between 20 and 5,000 characters." };
  }
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(rewardUsdc)
    || Number(rewardUsdc) <= 0 || Number(rewardUsdc) > 10_000) {
    return { error: "Reward must be between 0 and 10,000 USDC with at most six decimals." };
  }
  if (!isAddress(requesterAddress) || !isAddress(workerAddress)) {
    return { error: "Requester and worker must be valid EVM addresses." };
  }
  if (requesterAddress.toLowerCase() === workerAddress.toLowerCase()) {
    return { error: "Requester and worker must be different addresses." };
  }

  let pactId: string;
  try {
    const pact = await withPactStore((store) => store.createPact({
      idempotencyKey,
      requesterAddress,
      workerAddress,
      policyPackId: policyPack.id,
      policyVersion: policyPack.version,
      title,
      acceptanceCriteria,
      rewardUsdc,
      chainId: 84_532,
    }));
    pactId = pact.id;
  } catch {
    return { error: "The pact could not be saved. Check database availability and try again." };
  }
  redirect(`/app/jobs/${pactId}`);
}
