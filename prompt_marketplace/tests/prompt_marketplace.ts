import * as anchor from "@coral-xyz/anchor";
import * as borsh from "@coral-xyz/borsh";
import * as fs from "fs";
import BN from "bn.js";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, Connection, ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createInitializeMint2Instruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMint, getAccount } from "@solana/spl-token";
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

  // Shared setup variables
  let mintPubkey: PublicKey;
  let promptPda: PublicKey;
  let creatorToken: PublicKey;
  let metadataPda: PublicKey;

  // Retry utility function
  async function withRetry<T>(fn: () => Promise<T>, retries: number = 3, delayMs: number = 1000): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        console.warn(`Retry ${i + 1}/${retries} failed: ${err.message}. Retrying in ${delayMs}ms...`);
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

  // Define Listing account schema
  const listingSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"),
    borsh.publicKey("mint"),
    borsh.publicKey("seller"),
    borsh.u64("price"),
    borsh.bool("is_active"),
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

  // Define list_prompt instruction schema
  const listPromptSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"),
    borsh.u64("price"),
  ]);

  // Define delist_prompt instruction schema
  const delistPromptSchema = borsh.struct([
    borsh.array(borsh.u8(), 8, "discriminator"),
  ]);

  before(async () => {
    try {
      // Config PDA
      const configPda = new PublicKey("4wzdty85maw7Q6TZE8Z496DgJeFHwcA8HzmNMbBE8ivJ");

      // Check if Config account exists
      const configAccountInfo = await withRetry(() => connection.getAccountInfo(configPda));
      if (!configAccountInfo) {
        // Build initialize instruction
        const instructionDiscriminator = Buffer.from(
          createHash("sha256").update("global:initialize").digest().slice(0, 8)
        );
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
        console.log("Config initialization complete, transaction signature:", txSig);
      }

      // Prompt setup
      const metadataUri = "https://example.com/metadata.json";
      const royaltyBps = 500; // 5%
      const mint = Keypair.generate();
      mintPubkey = mint.publicKey;

      // Derive Prompt PDA
      const [promptPdaDerived, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("prompt"), mintPubkey.toBuffer()],
        programId
      );
      promptPda = promptPdaDerived;

      // Derive Metadata PDA
      const [metadataPdaDerived] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
          mintPubkey.toBuffer(),
        ],
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
      );
      metadataPda = metadataPdaDerived;

      // Pre-compute Creator Token Account (ATA) address
      creatorToken = getAssociatedTokenAddressSync(
        mintPubkey,
        admin.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      // Check if Prompt account exists
      const promptAccountInfo = await withRetry(() => connection.getAccountInfo(promptPda));
      if (promptAccountInfo) {
        console.log("Prompt account already exists, using existing data");
        return;
      }

      // Initialize mint and create ATA
      const initMintIx = createInitializeMint2Instruction(
        mintPubkey,
        0, // decimals
        admin.publicKey, // mint authority
        admin.publicKey, // freeze authority
        TOKEN_PROGRAM_ID
      );

      const createAtaIx = createAssociatedTokenAccountInstruction(
        admin.publicKey, // payer
        creatorToken, // ATA address
        admin.publicKey, // owner
        mintPubkey, // mint
        TOKEN_PROGRAM_ID
      );

      const initTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: mintPubkey,
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

      // Create prompt
      const instructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:create_prompt").digest().slice(0, 8)
      );
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
          { pubkey: mintPubkey, isSigner: false, isWritable: true }, // mint
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
    } catch (err) {
      console.error("Setup error:", err);
      throw err;
    }
  });

  it("Initializes the marketplace", async () => {
    try {
      const configPda = new PublicKey("4wzdty85maw7Q6TZE8Z496DgJeFHwcA8HzmNMbBE8ivJ");
      const expectedDiscriminator = Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]);

      const accountInfo = await withRetry(() => connection.getAccountInfo(configPda));
      assert(accountInfo, "Config account should exist");
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
    } catch (err) {
      console.error("Test error:", err);
      throw err;
    }
  });

  it("Creates a prompt", async () => {
    try {
      const expectedDiscriminator = Buffer.from(
        createHash("sha256").update("account:Prompt").digest().slice(0, 8)
      );

      const accountInfo = await withRetry(() => connection.getAccountInfo(promptPda));
      assert(accountInfo, "Prompt account should exist");
      console.log("Account data length:", accountInfo.data.length);
      console.log("Raw account data (hex):", accountInfo.data.toString("hex"));
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
      assert.equal(decoded.mint.toBase58(), mintPubkey.toBase58(), "Mint should match");
      assert.equal(decoded.creator.toBase58(), admin.publicKey.toBase58(), "Creator should match");
      assert.equal(decoded.metadata_uri, "https://example.com/metadata.json", "Metadata URI should match");
      assert.equal(Number(decoded.royalty_bps), 500, "Royalty BPS should match");
      assert.equal(decoded.bump, 254, "Bump should match");

      // Verify mint state
      const mintInfo = await withRetry(() => getMint(connection, mintPubkey));
      console.log("Mint Info:", {
        address: mintPubkey.toBase58(),
        mintAuthority: mintInfo.mintAuthority?.toBase58() || "null",
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || "null",
        decimals: mintInfo.decimals,
        supply: mintInfo.supply.toString()
      });
      assert.equal(mintInfo.mintAuthority?.toBase58(), admin.publicKey.toBase58(), "Mint authority should be admin");
      assert.equal(mintInfo.freezeAuthority?.toBase58(), admin.publicKey.toBase58(), "Freeze authority should be admin");
      assert.equal(mintInfo.decimals, 0, "Mint decimals should be 0");
      assert.equal(mintInfo.supply.toString(), "1", "Mint supply should be 1");

      // Verify creator token account
      const creatorTokenInfo = await withRetry(() => getAccount(connection, creatorToken));
      console.log("Creator Token Info:", {
        mint: creatorTokenInfo.mint.toBase58(),
        owner: creatorTokenInfo.owner.toBase58(),
        amount: creatorTokenInfo.amount.toString()
      });
      assert.equal(creatorTokenInfo.mint.toBase58(), mintPubkey.toBase58(), "Creator token mint should match");
      assert.equal(creatorTokenInfo.owner.toBase58(), admin.publicKey.toBase58(), "Creator token owner should be admin");
      assert.equal(creatorTokenInfo.amount.toString(), "1", "Creator token amount should be 1");
    } catch (err) {
      console.error("Test error:", err);
      throw err;
    }
  });

  it("Lists and delists a prompt", async () => {
    try {
      const seller = admin; // Seller is the creator/admin
      const price = new BN(1_000_000_000); // 1 SOL

      // Derive Listing PDA
      const [listingPda, listingBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPubkey.toBuffer()],
        programId
      );
      console.log("Listing PDA:", listingPda.toBase58());

      // Derive Escrow Authority PDA
      const [escrowAuthority, escrowBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), mintPubkey.toBuffer()],
        programId
      );
      console.log("Escrow Authority PDA:", escrowAuthority.toBase58());

      // Compute Escrow Token Account (ATA) address
      const escrowToken = getAssociatedTokenAddressSync(
        mintPubkey,
        escrowAuthority,
        true, // Allow owner off-curve (PDA)
        TOKEN_PROGRAM_ID
      );
      console.log("Escrow Token Address:", escrowToken.toBase58());

      // Expected discriminator for Listing account
      const expectedDiscriminator = Buffer.from(
        createHash("sha256").update("account:Listing").digest().slice(0, 8)
      );

      // Initialize escrow token account
      const createEscrowAtaIx = createAssociatedTokenAccountInstruction(
        seller.publicKey, // payer
        escrowToken, // ATA address
        escrowAuthority, // owner (PDA)
        mintPubkey, // mint
        TOKEN_PROGRAM_ID
      );

      const initEscrowTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        createEscrowAtaIx
      );

      let latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      initEscrowTx.recentBlockhash = latestBlockhash.blockhash;
      initEscrowTx.feePayer = seller.publicKey;
      initEscrowTx.sign(seller);
      const initEscrowTxSig = await withRetry(() =>
        connection.sendRawTransaction(initEscrowTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      await withRetry(() =>
        connection.confirmTransaction(
          { signature: initEscrowTxSig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
          "confirmed"
        )
      );
      console.log("Escrow token account initialization complete, transaction signature:", initEscrowTxSig);

      // Verify escrow token account (should be empty initially)
      const escrowTokenInfoInit = await withRetry(() => getAccount(connection, escrowToken));
      console.log("Escrow Token Info (initial):", {
        mint: escrowTokenInfoInit.mint.toBase58(),
        owner: escrowTokenInfoInit.owner.toBase58(),
        amount: escrowTokenInfoInit.amount.toString()
      });
      assert.equal(escrowTokenInfoInit.mint.toBase58(), mintPubkey.toBase58(), "Escrow token mint should match");
      assert.equal(escrowTokenInfoInit.owner.toBase58(), escrowAuthority.toBase58(), "Escrow token owner should be escrow authority");
      assert.equal(escrowTokenInfoInit.amount.toString(), "0", "Escrow token amount should be 0");

      // Build list_prompt instruction
      const listInstructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:list_prompt").digest().slice(0, 8)
      );
      const listInstructionData = Buffer.alloc(16);
      listPromptSchema.encode(
        {
          discriminator: listInstructionDiscriminator,
          price: price,
        },
        listInstructionData
      );

      const listIx = new TransactionInstruction({
        keys: [
          { pubkey: listingPda, isSigner: false, isWritable: true }, // listing
          { pubkey: promptPda, isSigner: false, isWritable: false }, // prompt
          { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
          { pubkey: seller.publicKey, isSigner: true, isWritable: true }, // seller
          { pubkey: creatorToken, isSigner: false, isWritable: true }, // seller_token
          { pubkey: escrowToken, isSigner: false, isWritable: true }, // escrow_token
          { pubkey: escrowAuthority, isSigner: false, isWritable: false }, // escrow_authority
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
        ],
        programId,
        data: listInstructionData,
      });

      const listTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        listIx
      );

      latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      listTx.recentBlockhash = latestBlockhash.blockhash;
      listTx.feePayer = seller.publicKey;
      listTx.sign(seller);
      const listTxSig = await withRetry(() =>
        connection.sendRawTransaction(listTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      await withRetry(() =>
        connection.confirmTransaction(
          { signature: listTxSig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
          "confirmed"
        )
      );
      console.log("Prompt listing complete, transaction signature:", listTxSig);

      // Verify Listing account
      const listingAccountInfo = await withRetry(() => connection.getAccountInfo(listingPda));
      assert(listingAccountInfo, "Listing account should exist");
      console.log("Listing account data length:", listingAccountInfo.data.length);
      console.log("Raw listing account data (hex):", listingAccountInfo.data.toString("hex"));
      const decodedListing = listingSchema.decode(listingAccountInfo.data);
      console.log("Listing Account:", {
        mint: decodedListing.mint.toBase58(),
        seller: decodedListing.seller.toBase58(),
        price: Number(decodedListing.price),
        isActive: decodedListing.is_active,
        bump: decodedListing.bump
      });
      const listingDiscriminator = listingAccountInfo.data.slice(0, 8);
      assert(
        listingDiscriminator.equals(expectedDiscriminator),
        `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${listingDiscriminator.toString("hex")}`
      );
      assert.equal(decodedListing.mint.toBase58(), mintPubkey.toBase58(), "Mint should match");
      assert.equal(decodedListing.seller.toBase58(), seller.publicKey.toBase58(), "Seller should match");
      assert.equal(Number(decodedListing.price), price.toNumber(), "Price should match");
      assert.equal(decodedListing.is_active, true, "Listing should be active");
      assert.equal(decodedListing.bump, listingBump, "Bump should match");

      // Verify Escrow Token account
      const escrowTokenInfo = await withRetry(() => getAccount(connection, escrowToken));
      console.log("Escrow Token Info:", {
        mint: escrowTokenInfo.mint.toBase58(),
        owner: escrowTokenInfo.owner.toBase58(),
        amount: escrowTokenInfo.amount.toString()
      });
      assert.equal(escrowTokenInfo.mint.toBase58(), mintPubkey.toBase58(), "Escrow token mint should match");
      assert.equal(escrowTokenInfo.owner.toBase58(), escrowAuthority.toBase58(), "Escrow token owner should be escrow authority");
      assert.equal(escrowTokenInfo.amount.toString(), "1", "Escrow token amount should be 1");

      // Verify Seller Token account
      const sellerTokenInfo = await withRetry(() => getAccount(connection, creatorToken));
      console.log("Seller Token Info:", {
        mint: sellerTokenInfo.mint.toBase58(),
        owner: sellerTokenInfo.owner.toBase58(),
        amount: sellerTokenInfo.amount.toString()
      });
      assert.equal(sellerTokenInfo.mint.toBase58(), mintPubkey.toBase58(), "Seller token mint should match");
      assert.equal(sellerTokenInfo.owner.toBase58(), seller.publicKey.toBase58(), "Seller token owner should be seller");
      assert.equal(sellerTokenInfo.amount.toString(), "0", "Seller token amount should be 0");

      // Build delist_prompt instruction
      const delistInstructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:delist_prompt").digest().slice(0, 8)
      );
      const delistInstructionData = Buffer.alloc(8);
      delistPromptSchema.encode(
        {
          discriminator: delistInstructionDiscriminator,
        },
        delistInstructionData
      );

      const delistIx = new TransactionInstruction({
        keys: [
          { pubkey: listingPda, isSigner: false, isWritable: true }, // listing
          { pubkey: promptPda, isSigner: false, isWritable: false }, // prompt
          { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
          { pubkey: seller.publicKey, isSigner: true, isWritable: true }, // seller
          { pubkey: creatorToken, isSigner: false, isWritable: true }, // seller_token
          { pubkey: escrowToken, isSigner: false, isWritable: true }, // escrow_token
          { pubkey: escrowAuthority, isSigner: false, isWritable: false }, // escrow_authority
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
        ],
        programId,
        data: delistInstructionData,
      });

      const delistTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        delistIx
      );

      latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      delistTx.recentBlockhash = latestBlockhash.blockhash;
      delistTx.feePayer = seller.publicKey;
      delistTx.sign(seller);
      const delistTxSig = await withRetry(() =>
        connection.sendRawTransaction(delistTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      await withRetry(() =>
        connection.confirmTransaction(
          { signature: delistTxSig, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
          "confirmed"
        )
      );
      console.log("Prompt delisting complete, transaction signature:", delistTxSig);

      // Verify Listing account (after delisting)
      const listingAccountInfoPost = await withRetry(() => connection.getAccountInfo(listingPda));
      assert(listingAccountInfoPost, "Listing account should exist");
      const decodedListingPost = listingSchema.decode(listingAccountInfoPost.data);
      console.log("Listing Account (post-delist):", {
        mint: decodedListingPost.mint.toBase58(),
        seller: decodedListingPost.seller.toBase58(),
        price: Number(decodedListingPost.price),
        isActive: decodedListingPost.is_active,
        bump: decodedListingPost.bump
      });
      assert.equal(decodedListingPost.is_active, false, "Listing should be inactive");

      // Verify Escrow Token account (after delisting)
      const escrowTokenInfoPost = await withRetry(() => getAccount(connection, escrowToken));
      console.log("Escrow Token Info (post-delist):", {
        mint: escrowTokenInfoPost.mint.toBase58(),
        owner: escrowTokenInfoPost.owner.toBase58(),
        amount: escrowTokenInfoPost.amount.toString()
      });
      assert.equal(escrowTokenInfoPost.amount.toString(), "0", "Escrow token amount should be 0");

      // Verify Seller Token account (after delisting)
      const sellerTokenInfoPost = await withRetry(() => getAccount(connection, creatorToken));
      console.log("Seller Token Info (post-delist):", {
        mint: sellerTokenInfoPost.mint.toBase58(),
        owner: sellerTokenInfoPost.owner.toBase58(),
        amount: sellerTokenInfoPost.amount.toString()
      });
      assert.equal(sellerTokenInfoPost.amount.toString(), "1", "Seller token amount should be 1");
    } catch (err) {
      console.error("Test error:", err);
      throw err;
    }
  });
});