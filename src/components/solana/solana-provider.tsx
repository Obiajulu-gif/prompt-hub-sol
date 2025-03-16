"use client";

import dynamic from "next/dynamic";
import { AnchorProvider } from "@coral-xyz/anchor";
import { WalletError } from "@solana/wallet-adapter-base";
import {
  useConnection,
  useWallet,
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom"; // Using Phantom manually
import { ReactNode, useCallback, useMemo } from "react";

require("@solana/wallet-adapter-react-ui/styles.css");

// ✅ Dynamically load WalletButton to fix SSR issues
export const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export function SolanaProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => "https://api.testnet.sonic.game", []);

  const onError = useCallback((error: WalletError) => {
    console.error(error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[new PhantomWalletAdapter()]} onError={onError} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

// ✅ Fix missing `useAnchorProvider` export
export function useAnchorProvider() {
  const { connection } = useConnection();
  const wallet = useWallet();
  return new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
}
