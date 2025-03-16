"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/solana/solana-provider"; // Import the wallet button
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Menu, Search, LogOut } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export function Navigation() {
  const { publicKey, disconnect } = useWallet(); // Get wallet state & disconnect function

  return (
    <header className="sticky top-0 z-50 w-full bg-gray-950/90 backdrop-blur-lg shadow-lg">
      <div className="container mx-auto px-6 lg:px-10 flex h-20 items-center justify-between">
        {/* Left Section: Logo & Navigation */}
        <div className="flex items-center space-x-8">
          {/* Logo */}
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

        {/* Right Section: Search, Mobile Menu & Wallet Button */}
        <div className="flex items-center space-x-6">
          {/* Search Bar (Hidden on Small Screens) */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Search prompts..."
              className="pl-10 pr-4 h-12 rounded-xl bg-gray-800 border border-gray-700 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500 transition"
            />
          </div>

          {/* Mobile Menu (Shown Only on Small Screens) */}
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
              <WalletButton className="bg-purple-700 hover:bg-purple-800 text-white px-5 py-3 rounded-xl text-lg font-semibold transition">
                Connect Wallet
              </WalletButton>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
