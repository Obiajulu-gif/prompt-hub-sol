"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Menu, LogOut, Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

// ✅ Dynamically load WalletButton to prevent SSR issues
const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export function Navigation() {
  const { publicKey, disconnect, connecting } = useWallet(); // ✅ Added `connecting` state
  const [isConnecting, setIsConnecting] = useState(false);

  // ✅ Watch `connecting` state and update the UI accordingly
  useEffect(() => {
    if (connecting) {
      setIsConnecting(true);
    } else {
      setTimeout(() => setIsConnecting(false), 500); // Small delay for smooth transition
    }
  }, [connecting]);

  return (
    <header className="sticky top-0 z-50 w-full bg-gray-950/90 backdrop-blur-lg shadow-lg border-b border-gray-800">
      <div className="container mx-auto px-6 lg:px-10 flex h-20 items-center justify-between">
        
        {/* Left Section: Logo & Desktop Navigation */}
        <div className="flex items-center space-x-8">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/images/logo.png" alt="PromptHub Logo" width={40} height={40} className="object-contain" />
            <span className="hidden font-bold text-lg sm:inline-block text-purple-400">PromptHub</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8 text-sm font-medium text-gray-300">
            <Link href="/browse" className="hover:text-white transition">Browse</Link>
            <Link href="/sell" className="hover:text-white transition">Sell</Link>
            <Link href="/governance" className="hover:text-white transition">Governance</Link>
            <Link href="/profile" className="hover:text-white transition">Profile</Link>
          </nav>
        </div>

        {/* Right Section: Mobile Menu & Wallet Button */}
        <div className="flex items-center space-x-6">
          
          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" className="lg:hidden text-gray-300 hover:text-white transition">
                <Menu className="h-7 w-7" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="pr-0 bg-gray-900 text-white">
              <nav className="grid gap-6 px-6 py-8 text-lg font-medium">
                <Link href="/browse" className="hover:text-gray-300">Browse</Link>
                <Link href="/sell" className="hover:text-gray-300">Sell</Link>
                <Link href="/governance" className="hover:text-gray-300">Governance</Link>
                <Link href="/profile" className="hover:text-gray-300">Profile</Link>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Wallet Connect / Disconnect Button */}
          <div className="ml-auto flex items-center space-x-4">
            {publicKey ? (
              <div className="flex items-center space-x-4">
                {/* Wallet Address Display */}
                <span className="bg-gray-800 text-purple-400 px-4 py-2 rounded-xl text-sm font-semibold border border-purple-600">
                  {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                </span>

                {/* Disconnect Button */}
                <Button
                  variant="outline"
                  className="border-red-500 text-red-500 hover:bg-red-600 hover:text-white transition"
                  onClick={() => disconnect()}
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-6 py-3 rounded-xl text-lg font-semibold transition flex items-center shadow-lg animate-fade-in"
                disabled={isConnecting} // Disable button while connecting
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5 mr-2" /> Connecting...
                  </>
                ) : (
                  "Connect Wallet"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
