"use client";

import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  safeWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.trim() || "https://sepolia.base.org";
const hasWalletConnect = Boolean(projectId && !["PROJECT_ID", "YOUR_PROJECT_ID"].includes(projectId));
const transports = { [baseSepolia.id]: http(rpcUrl) };

export const walletConfig = hasWalletConnect
  ? getDefaultConfig({
      appName: "ProofPact",
      projectId: projectId!,
      chains: [baseSepolia],
      transports,
      ssr: true,
    })
  : createConfig({
      chains: [baseSepolia],
      connectors: connectorsForWallets(
        [
          { groupName: "Recommended", wallets: [metaMaskWallet, okxWallet, coinbaseWallet, injectedWallet] },
          { groupName: "Installed wallets", wallets: [rabbyWallet, safeWallet] },
        ],
        { appName: "ProofPact", projectId: "direct-wallets-only" },
      ),
      transports,
      ssr: true,
    });
