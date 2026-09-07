"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { walletConfig } from "./_lib/wallet-config";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 12_000 } },
  }));

  return <WagmiProvider config={walletConfig} reconnectOnMount>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider theme={darkTheme({
        accentColor: "#6ee7e1",
        accentColorForeground: "#080b0f",
        borderRadius: "small",
        fontStack: "system",
        overlayBlur: "small",
      })}>
        {children}
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>;
}
