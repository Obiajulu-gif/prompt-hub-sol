"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom"; // Use Phantom directly
import { ReactNode, useMemo } from "react";

require("@solana/wallet-adapter-react-ui/styles.css");

export function SolanaProvider({ children }: { children: ReactNode }) {
const endpoint = useMemo(() => process.env.NEXT_PUBLIC_RPC_URL || "https://devnet.sonic.game", []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[new PhantomWalletAdapter()]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
