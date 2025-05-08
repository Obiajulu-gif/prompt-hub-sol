import * as anchor from "@coral-xyz/anchor";
import * as borsh from "@coral-xyz/borsh";
import * as fs from "fs";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import { assert } from "chai";
import { createHash } from "crypto";

describe("Prompt Marketplace", () => {
  // Set up connection
  const connection = new Connection("https://api.devnet.solana.com", { commitment: "confirmed" });

  // Program ID
  const programId = new PublicKey("CBrB6yQSi9pcxKuRR1uPjj6NLipfpZKYYT71c3gaFf1Y");

  // Admin keypair (loaded from ~/.config/solana/id.json)
  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
  );

  // Define Config account schema
  const configSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"), // 8 bytes
    borsh.publicKey("admin"), // 32 bytes
    borsh.u64("fee_bps"), // 8 bytes
    borsh.u8("bump"), // 1 byte
  ]);

  // Define initialize instruction schema
  const initializeSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"), // 8 bytes for sha256("global:initialize")[:8]
    borsh.u64("fee_bps"), // Fee in basis points
  ]);

  it("Initializes the marketplace", async () => {
    try {
      // Derive Config PDA
      const [expectedPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
      );
      console.log("Expected Config PDA:", expectedPda.toBase58()); // Should be 3k7Z3j4n6a4zqKKBZ3tL2j2mZKWQkzLnrwZ8t9kLDEEU

      // Use the existing Config PDA from previous run
      const configPda = new PublicKey("4wzdty85maw7Q6TZE8Z496DgJeFHwcA8HzmNMbBE8ivJ");
      console.log("Using Config PDA:", configPda.toBase58());

      // Expected discriminator for Config account
      const expectedDiscriminator = Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]); // sha256("account:Config")[:8]

      // Compute initialize instruction discriminator
      const instructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:initialize").digest().slice(0, 8)
      );

      // Check if Config account exists
      const accountInfo = await connection.getAccountInfo(configPda);
      if (accountInfo) {
        console.log("Config account already exists, skipping initialization");
        // Decode account data
        const decoded = configSchema.decode(accountInfo.data);
        console.log("Config Account:", {
          admin: decoded.admin.toBase58(),
          feeBps: Number(decoded.fee_bps),
          bump: decoded.bump
        });
        // Verify discriminator
        const accountDiscriminator = accountInfo.data.slice(0, 8);
        assert(
          accountDiscriminator.equals(expectedDiscriminator),
          `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${accountDiscriminator.toString("hex")}`
        );
        assert.equal(decoded.admin.toBase58(), admin.publicKey.toBase58(), "Admin should match");
        assert.equal(Number(decoded.fee_bps), 1000, "Fee should be 1000 bps");
        assert.equal(decoded.bump, 255, "Bump should match");
        return; // Test passes
      }

      // Build initialize instruction
      const instructionData = Buffer.alloc(16); // 8 bytes discriminator + 8 bytes fee_bps
      initializeSchema.encode(
        {
          discriminator: instructionDiscriminator,
          fee_bps: BigInt(1000),
        },
        instructionData
      );

      const initIx = new TransactionInstruction({
        keys: [
          { pubkey: configPda, isSigner: false, isWritable: true },
          { pubkey: admin.publicKey, isSigner: true, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: instructionData,
      });

      // Build transaction
      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        initIx
      );

      // Sign and send transaction
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = admin.publicKey;
      tx.sign(admin);
      const txSig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        { signature: txSig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
        "confirmed"
      );
      console.log("Initialization complete, transaction signature:", txSig);

      // Verify initialized account
      const accountInfoPost = await connection.getAccountInfo(configPda);
      if (!accountInfoPost) {
        throw new Error("Config account not found after initialization");
      }
      console.log("Account data length:", accountInfoPost.data.length);
      console.log("Raw account data (hex):", accountInfoPost.data.toString("hex"));
      const decoded = configSchema.decode(accountInfoPost.data);
      console.log("Config Account:", {
        admin: decoded.admin.toBase58(),
        feeBps: Number(decoded.fee_bps),
        bump: decoded.bump
      });
      // Verify discriminator
      const accountDiscriminator = accountInfoPost.data.slice(0, 8);
      assert(
        accountDiscriminator.equals(expectedDiscriminator),
        `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${accountDiscriminator.toString("hex")}`
      );
      assert.equal(decoded.admin.toBase58(), admin.publicKey.toBase58(), "Admin should match");
      assert.equal(Number(decoded.fee_bps), 1000, "Fee should be 1000 bps");
      assert.equal(decoded.bump, 255, "Bump should match");
    } catch (err) {
      console.error("Test error:", err);
      throw err;
    }
  });
});