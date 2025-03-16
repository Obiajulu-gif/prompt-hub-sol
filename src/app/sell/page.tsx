"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, web3, BN, Wallet } from "@coral-xyz/anchor";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, ChangeEvent, FormEvent } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import idl from "../../../anchor/target/idl/prompthubsol.json"; // Import IDL

// ✅ Replace with your actual program ID
const PROGRAM_ID = new web3.PublicKey("G1SfRwFsFTNFZC1RXxraZ3BPbJfwZduGd4thJnF9bpyd");

export default function SellPage() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [formData, setFormData] = useState({
        title: "",
        description: "",
        category: "",
        price: "",
        file: null as File | null,
    });
    const [errors, setErrors] = useState<{ [key: string]: string | null }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
        if (errors[e.target.name]) {
            setErrors((prev) => ({ ...prev, [e.target.name]: null }));
        }
    };

    const handleCategoryChange = (value: string) => {
        setFormData((prev) => ({ ...prev, category: value }));
        if (errors.category) {
            setErrors((prev) => ({ ...prev, category: null }));
        }
    };

    const validateForm = (): boolean => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.title.trim()) newErrors.title = "Title is required";
        if (!formData.description.trim()) newErrors.description = "Description is required";
        if (!formData.category) newErrors.category = "Category is required";
        if (!formData.price) newErrors.price = "Price is required";
        else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0)
            newErrors.price = "Price must be a positive number";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;

        if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
            alert("Please connect your wallet first.");
            return;
        }

        try {
            setIsSubmitting(true);

            // ✅ Corrected wallet type issue
            const provider = new AnchorProvider(connection, wallet as Wallet, {
                preflightCommitment: "processed",
            });
            const program = new Program(idl as any, PROGRAM_ID, provider);

            // ✅ Generate a PDA for the listing
            const [listingPDA] = web3.PublicKey.findProgramAddressSync(
                [Buffer.from("listing"), wallet.publicKey.toBuffer()],
                PROGRAM_ID
            );

            // ✅ Create Transaction
            const tx = await program.methods
                .createListing(
                    formData.title,
                    formData.description,
                    new BN(parseFloat(formData.price) * web3.LAMPORTS_PER_SOL), // Convert SOL to Lamports
                    formData.category,
                    "ipfs_hash_placeholder" // Replace with actual IPFS hash
                )
                .accounts({
                    listing: listingPDA,
                    owner: wallet.publicKey,
                    systemProgram: web3.SystemProgram.programId,
                })
                .rpc();

            console.log("Transaction Signature:", tx);
            alert("Prompt listed successfully!");
        } catch (error) {
            console.error("❌ Error submitting listing:", error);
            alert("Failed to list prompt. Check console for details.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-r from-purple-400 to-blue-500">
            <Navigation />
            <main className="flex-1 container py-8">
                <div className="max-w-5xl mx-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle>List a New Prompt</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Title</label>
                                        <Input placeholder="Enter prompt title" name="title" value={formData.title} onChange={handleChange} />
                                        {errors.title && <p className="text-sm text-red-500">{errors.title}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Category</label>
                                        <Select value={formData.category} onValueChange={handleCategoryChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="creative">Creative Writing</SelectItem>
                                                <SelectItem value="coding">Coding</SelectItem>
                                                <SelectItem value="marketing">Marketing</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {errors.category && <p className="text-sm text-red-500">{errors.category}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Description</label>
                                    <Textarea placeholder="Describe your prompt..." name="description" value={formData.description} onChange={handleChange} rows={4} />
                                    {errors.description && <p className="text-sm text-red-500">{errors.description}</p>}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Price (SOL)</label>
                                    <Input type="number" placeholder="0.00" name="price" value={formData.price} onChange={handleChange} step="0.01" />
                                    {errors.price && <p className="text-sm text-red-500">{errors.price}</p>}
                                </div>

                                <Button type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? "Submitting..." : "Submit Prompt"}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </main>
            <Footer />
        </div>
    );
}
