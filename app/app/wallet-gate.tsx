"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import styles from "./workspace.module.css";

export function WalletGate() {
  return <ConnectButton.Custom>
    {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
      const connected = mounted && account && chain;
      if (!mounted) return <div className={styles.walletGate} aria-hidden="true" />;
      if (!connected) return <div className={styles.walletGate}>
        <section aria-labelledby="wallet-gate-title">
          <div className={styles.walletGateMark} aria-hidden="true"><span>P</span><i /></div>
          <span>Base Sepolia workspace</span>
          <h1 id="wallet-gate-title">Enter ProofPact.</h1>
          <p>Connect a wallet to fund work, submit evidence, and authorize settlement from one consistent account.</p>
          <button type="button" onClick={openConnectModal}>Connect wallet</button>
          <small>ProofPact never receives or stores your private key.</small>
        </section>
      </div>;
      if (chain.unsupported) return <div className={styles.walletGate}>
        <section aria-labelledby="network-gate-title">
          <div className={styles.walletGateMark} aria-hidden="true"><span>!</span><i /></div>
          <span>Unsupported network</span>
          <h1 id="network-gate-title">Switch to Base.</h1>
          <p>ProofPact’s live escrow and worker attestations currently operate on Base Sepolia.</p>
          <button type="button" onClick={openChainModal}>Switch network</button>
        </section>
      </div>;
      return <button className={styles.walletSession} type="button" onClick={openAccountModal} aria-label="Manage connected wallet">
        <i />
        <span>{chain.name}</span>
        <strong>{account.displayName}</strong>
      </button>;
    }}
  </ConnectButton.Custom>;
}
