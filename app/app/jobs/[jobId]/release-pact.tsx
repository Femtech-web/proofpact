"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { confirmReleaseAction, prepareReleaseAction } from "./actions";
import styles from "../../workspace.module.css";

export function ReleasePact({ pactId, receiptId, requesterAddress }: Readonly<{ pactId: string; receiptId: string; requesterAddress: string }>) {
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("Release payment");
  const [error, setError] = useState("");
  const isRequester = address?.toLowerCase() === requesterAddress.toLowerCase();

  async function release() {
    setPending(true);
    setError("");
    try {
      if (!isRequester) throw new Error(`Switch to requester ${requesterAddress}.`);
      if (chainId !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });
      setStatus("Preparing receipt-bound release…");
      const prepared = await prepareReleaseAction(pactId, receiptId);
      if (!prepared.ok) throw new Error(prepared.error);
      setStatus("Confirm release in wallet…");
      const transactionHash = await sendTransactionAsync({ to: prepared.to, data: prepared.data, value: 0n });
      setStatus("Confirming Base settlement…");
      const confirmed = await confirmReleaseAction(pactId, receiptId, transactionHash);
      if (!confirmed.ok) throw new Error(confirmed.error);
      setStatus("Released");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Release failed.");
      setStatus("Release payment");
    } finally {
      setPending(false);
    }
  }

  return <section className={styles.roleHandoff}>
    <span>Base settlement</span>
    <h2>Verification passed</h2>
    <p>The receipt authorizes exactly this pact, worker, token, amount, and decision. The requester now submits the release transaction.</p>
    <button type="button" disabled={pending || !isRequester} onClick={release}>{status}<span>→</span></button>
    {error ? <p className={styles.formError} role="alert">{error}</p> : null}
  </section>;
}
