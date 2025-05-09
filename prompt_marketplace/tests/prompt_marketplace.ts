import * as anchor from "@coral-xyz/anchor";
import * as borsh from "@coral-xyz/borsh";
import * as fs from "fs";
import BN from "bn.js";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, Connection, ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createInitializeMint2Instruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMint } from "@solana/spl-token";
import { assert } from "chai";
import { createHash } from "crypto";

describe("Prompt Marketplace", () => {
  // Set up connection
  const connection = new Connection("https://api.devnet.solana.com", { 
    commitment: "confirmed", 
    wsEndpoint: "wss://api.devnet.solana.com",
  });

  // Program ID
  const programId = new PublicKey("CBrB6yQSi9pcxKuRR1uPjj6NLipfpZKYYT71c3gaFf1Y");

  // Admin keypair (loaded from ~/.config/solana/id.json)
  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
  );

  // Retry utility function
  async function withRetry<T>(fn: () => Promise<T>, retries: number = 3, delayMs: number = 1000): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        console.warn(`Retry ${i + 1}/${retries} failed: ${(err as Error).message}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw new Error("Retry attempts exhausted");
  }

  // Define Config account schema
  const configSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"),
    borsh.publicKey("admin"),
    borsh.u64("fee_bps"),
    borsh.u8("bump"),
  ]);

  // Define Prompt account schema
  const promptSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"),
    borsh.publicKey("mint"),
    borsh.publicKey("creator"),
    borsh.str("metadata_uri"),
    borsh.u64("royalty_bps"),
    borsh.u8("bump"),
  ]);

  // Define initialize instruction schema
  const initializeSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"),
    borsh.u64("fee_bps"),
  ]);

  // Define create_prompt instruction schema
  const createPromptSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"),
    borsh.str("metadata_uri"),
    borsh.u64("royalty_bps"),
  ]);

  it("Initializes the marketplace", async () => {
    try {
      // Derive Config PDA
      const [expectedPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
      );
      console.log("Expected Config PDA:", expectedPda.toBase58());

      // Use the existing Config PDA
      const configPda = new PublicKey("4wzdty85maw7Q6TZE8Z496DgJeFHwcA8HzmNMbBE8ivJ");
      console.log("Using Config PDA:", configPda.toBase58());

      // Expected discriminator for Config account
      const expectedDiscriminator = Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]);

      // Compute initialize instruction discriminator
      const instructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:initialize").digest().slice(0, 8)
      );

      // Check if Config account exists with retry
      const accountInfo = await withRetry(() => connection.getAccountInfo(configPda));
      if (accountInfo) {
        console.log("Config account already exists, skipping initialization");
        const decoded = configSchema.decode(accountInfo.data);
        console.log("Config Account:", {
          admin: decoded.admin.toBase58(),
          feeBps: Number(decoded.fee_bps),
          bump: decoded.bump
        });
        const accountDiscriminator = accountInfo.data.slice(0, 8);
        assert(
          accountDiscriminator.equals(expectedDiscriminator),
          `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${accountDiscriminator.toString("hex")}`
        );
        assert.equal(decoded.admin.toBase58(), admin.publicKey.toBase58(), "Admin should match");
        assert.equal(Number(decoded.fee_bps), 1000, "Fee should be 1000 bps");
        assert.equal(decoded.bump, 255, "Bump should match");
        return;
      }

      // Build initialize instruction
      const instructionData = Buffer.alloc(16);
      initializeSchema.encode(
        {
          discriminator: instructionDiscriminator,
          fee_bps: new BN(1000),
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

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        initIx
      );

      const latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = admin.publicKey;
      tx.sign(admin);
      const txSig = await withRetry(() =>
        connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      await withRetry(() =>
        connection.confirmTransaction(
          { signature: txSig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
          "confirmed"
        )
      );
      console.log("Initialization complete, transaction signature:", txSig);

      const accountInfoPost = await withRetry(() => connection.getAccountInfo(configPda));
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

  it("Creates a prompt", async () => {
    try {
      // Config PDA
      const configPda = new PublicKey("4wzdty85maw7Q6TZE8Z496DgJeFHwcA8HzmNMbBE8ivJ");

      // Prompt parameters
      const metadataUri = "https://example.com/metadata.json";
      const royaltyBps = 500; // 5%

      // Generate mint keypair
      const mint = Keypair.generate();

      // Derive Prompt PDA
      const [promptPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("prompt"), mint.publicKey.toBuffer()],
        programId
      );
      console.log("Prompt PDA:", promptPda.toBase58());

      // Derive Metadata PDA
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
          mint.publicKey.toBuffer(),
        ],
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
      );
      console.log("Metadata PDA:", metadataPda.toBase58());

      // Pre-compute Creator Token Account (ATA) address
      const creatorToken = getAssociatedTokenAddressSync(
        mint.publicKey,
        admin.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      console.log("Creator Token Address:", creatorToken.toBase58());

      // Expected discriminator for Prompt account
      const expectedDiscriminator = Buffer.from(
        createHash("sha256").update("account:Prompt").digest().slice(0, 8)
      );

      // Compute create_prompt instruction discriminator
      const instructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:create_prompt").digest().slice(0, 8)
      );

      // Check if Prompt account exists with retry
      const accountInfo = await withRetry(() => connection.getAccountInfo(promptPda));
      if (accountInfo) {
        console.log("Prompt account already exists, skipping creation");
        const decoded = promptSchema.decode(accountInfo.data);
        console.log("Prompt Account:", {
          mint: decoded.mint.toBase58(),
          creator: decoded.creator.toBase58(),
          metadataUri: decoded.metadata_uri,
          royaltyBps: Number(decoded.royalty_bps),
          bump: decoded.bump
        });
        const accountDiscriminator = accountInfo.data.slice(0, 8);
        assert(
          accountDiscriminator.equals(expectedDiscriminator),
          `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${accountDiscriminator.toString("hex")}`
        );
        assert.equal(decoded.mint.toBase58(), mint.publicKey.toBase58(), "Mint should match");
        assert.equal(decoded.creator.toBase58(), admin.publicKey.toBase58(), "Creator should match");
        assert.equal(decoded.metadata_uri, metadataUri, "Metadata URI should match");
        assert.equal(Number(decoded.royalty_bps), royaltyBps, "Royalty BPS should match");
        assert.equal(decoded.bump, bump, "Bump should match");
        return;
      }

      // Initialize mint and create ATA in a separate transaction
      const initMintIx = createInitializeMint2Instruction(
        mint.publicKey,
        0, // decimals
        admin.publicKey, // mint authority
        admin.publicKey, // freeze authority
        TOKEN_PROGRAM_ID
      );

      const createAtaIx = createAssociatedTokenAccountInstruction(
        admin.publicKey, // payer
        creatorToken, // ATA address
        admin.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_PROGRAM_ID
      );

      const initTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports: await withRetry(() => connection.getMinimumBalanceForRentExemption(MINT_SIZE)),
          programId: TOKEN_PROGRAM_ID,
        }),
        initMintIx,
        createAtaIx
      );

      const latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      initTx.recentBlockhash = latestBlockhash.blockhash;
      initTx.feePayer = admin.publicKey;
      initTx.sign(admin, mint);
      const initTxSig = await withRetry(() =>
        connection.sendRawTransaction(initTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      await withRetry(() =>
        connection.confirmTransaction(
          { signature: initTxSig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
          "confirmed"
        )
      );
      console.log("Mint and ATA initialization complete, transaction signature:", initTxSig);

      // Verify mint state
      const mintInfo = await withRetry(() => getMint(connection, mint.publicKey));
      console.log("Mint Info:", {
        address: mint.publicKey.toBase58(),
        mintAuthority: mintInfo.mintAuthority?.toBase58() || "null",
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || "null",
        decimals: mintInfo.decimals,
        supply: mintInfo.supply.toString()
      });
      assert.equal(mintInfo.mintAuthority?.toBase58(), admin.publicKey.toBase58(), "Mint authority should be admin");
      assert.equal(mintInfo.freezeAuthority?.toBase58(), admin.publicKey.toBase58(), "Freeze authority should be admin");
      assert.equal(mintInfo.decimals, 0, "Mint decimals should be 0");
      assert.equal(mintInfo.supply.toString(), "0", "Mint supply should be 0");

      // Build create_prompt instruction
      const instructionData = Buffer.alloc(8 + 4 + metadataUri.length + 8);
      const encodedLength = createPromptSchema.encode(
        {
          discriminator: instructionDiscriminator,
          metadata_uri: metadataUri,
          royalty_bps: new BN(royaltyBps),
        },
        instructionData
      );
      const trimmedInstructionData = instructionData.slice(0, encodedLength);

      const createIx = new TransactionInstruction({
        keys: [
          { pubkey: promptPda, isSigner: false, isWritable: true }, // prompt
          { pubkey: mint.publicKey, isSigner: false, isWritable: true }, // mint
          { pubkey: creatorToken, isSigner: false, isWritable: true }, // creator_token
          { pubkey: admin.publicKey, isSigner: true, isWritable: true }, // creator
          { pubkey: metadataPda, isSigner: false, isWritable: true }, // metadata
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
          { pubkey: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), isSigner: false, isWritable: false }, // metadata_program
          { pubkey: anchor.web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
        ],
        programId,
        data: trimmedInstructionData,
      });

      // Build transaction for create_prompt
      const createTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
        createIx
      );

      const createBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      createTx.recentBlockhash = createBlockhash.blockhash;
      createTx.feePayer = admin.publicKey;
      createTx.sign(admin);
      const createTxSig = await withRetry(() =>
        connection.sendRawTransaction(createTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      await withRetry(() =>
        connection.confirmTransaction(
          { signature: createTxSig, blockhash: createBlockhash.blockhash, lastValidBlockHeight: createBlockhash.lastValidBlockHeight },
          "confirmed"
        )
      );
      console.log("Prompt creation complete, transaction signature:", createTxSig);

      // Verify created account
      const accountInfoPost = await withRetry(() => connection.getAccountInfo(promptPda));
      if (!accountInfoPost) {
        throw new Error("Prompt account not found after creation");
      }
      console.log("Account data length:", accountInfoPost.data.length);
      console.log("Raw account data (hex):", accountInfoPost.data.toString("hex"));
      const decoded = promptSchema.decode(accountInfoPost.data);
      console.log("Prompt Account:", {
        mint: decoded.mint.toBase58(),
        creator: decoded.creator.toBase58(),
        metadataUri: decoded.metadata_uri,
        royaltyBps: Number(decoded.royalty_bps),
        bump: decoded.bump
      });
      const accountDiscriminator = accountInfoPost.data.slice(0, 8);
      assert(
        accountDiscriminator.equals(expectedDiscriminator),
        `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${accountDiscriminator.toString("hex")}`
      );
      assert.equal(decoded.mint.toBase58(), mint.publicKey.toBase58(), "Mint should match");
      assert.equal(decoded.creator.toBase58(), admin.publicKey.toBase58(), "Creator should match");
      assert.equal(decoded.metadata_uri, metadataUri, "Metadata URI should match");
      assert.equal(Number(decoded.royalty_bps), royaltyBps, "Royalty BPS should match");
      assert.equal(decoded.bump, bump, "Bump should match");
    } catch (err) {
      console.error("Test error:", err);
      throw err;
    }
  });
});