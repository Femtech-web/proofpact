"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import type { FundingPlan } from "@/features/funding/domain/funding-plan";
import { confirmFundingAction } from "./actions";
import styles from "../../workspace.module.css";

export function FundPact({
  plan,
  requesterAddress,
  externalPactId,
}: Readonly<{ plan: FundingPlan; requesterAddress: string; externalPactId: string }>) {
  const router = useRouter();
  const [state, setState] = useState("Approve and fund pact");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const [fundingHash, setFundingHash] = useState("");

  useEffect(() => {
    const storageKey = `proofpact:funding:${externalPactId}`;
    setFundingHash(window.localStorage.getItem(storageKey) ?? "");
  }, [externalPactId]);

  const isRequester = Boolean(address && address.toLowerCase() === requesterAddress.toLowerCase());

  async function reconcile(hash: string) {
    setPending(true);
    setError("");
    setState("Verifying onchain evidence…");
    try {
      const result = await confirmFundingAction(externalPactId, hash);
      if (!result.ok) throw new Error(result.error);
      window.localStorage.removeItem(`proofpact:funding:${externalPactId}`);
      setFundingHash("");
      setState("Pact funded");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Funding confirmation failed.");
      setState("Reconcile confirmed funding");
    } finally {
      setPending(false);
    }
  }

  async function fund() {
    setPending(true);
    setError("");
    try {
      if (!address || !isRequester) {
        throw new Error("Connect the requester wallet recorded on this pact.");
      }
      if (!publicClient) throw new Error("Base Sepolia is not available.");
      setState("Approving exact USDC amount…");
      const approvalHash = await sendTransactionAsync({
        to: plan.approval.to,
        data: plan.approval.data,
        value: 0n,
      });
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash, timeout: 180_000 });
      if (approvalReceipt.status !== "success") throw new Error("The USDC approval reverted.");

      setState("Locking reward in escrow…");
      const nextFundingHash = await sendTransactionAsync({
        to: plan.funding.to,
        data: plan.funding.data,
        value: 0n,
      });
      window.localStorage.setItem(`proofpact:funding:${externalPactId}`, nextFundingHash);
      setFundingHash(nextFundingHash);
      const fundingReceipt = await publicClient.waitForTransactionReceipt({ hash: nextFundingHash, timeout: 180_000 });
      if (fundingReceipt.status !== "success") throw new Error("The escrow funding transaction reverted.");
      await reconcile(nextFundingHash);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Funding failed.");
      setState(fundingHash ? "Reconcile confirmed funding" : "Approve and fund pact");
    } finally {
      setPending(false);
    }
  }

  return <section className={styles.fundingPanel}>
    <div>
      <span>Base Sepolia escrow</span>
      <strong>Lock {Number(BigInt(plan.amountBaseUnits)) / 1_000_000} USDC</strong>
      <p>The wallet first approves the exact reward, then funds immutable terms. ProofPact records FUNDED only after independently reading the confirmed event.</p>
    </div>
    <div className={isRequester ? styles.roleMatch : styles.roleMismatch}>
      <span>Connected requester</span>
      <strong>{address ?? "No wallet connected"}</strong>
      <small>{isRequester ? "Eligible to fund" : `Switch to ${requesterAddress}`}</small>
    </div>
    <button
      type="button"
      disabled={pending || (!fundingHash && !isRequester)}
      aria-busy={pending}
      onClick={() => fundingHash ? reconcile(fundingHash) : fund()}
    >{fundingHash && !pending ? "Reconcile confirmed funding" : state}<span>→</span></button>
    {fundingHash ? <p className={styles.fundingReference}>Funding transaction: <code>{fundingHash}</code>. ProofPact will not request another payment while this transaction awaits reconciliation.</p> : null}
    {error ? <p className={styles.formError} role="alert">{error}</p> : null}
  </section>;
}
