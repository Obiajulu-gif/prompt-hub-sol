import * as anchor from "@coral-xyz/anchor";
import * as borsh from "@coral-xyz/borsh";
import * as fs from "fs";
import BN from "bn.js";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, Connection, ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createInitializeMint2Instruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMint, getAccount, createTransferInstruction } from "@solana/spl-token";
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
  let promptBump: number;
  let creatorToken: PublicKey;
  let metadataPda: PublicKey;

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

  // Define buy_prompt instruction schema
  const buyPromptSchema = borsh.struct([
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
        const initTxSig = await withRetry(() =>
          connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          })
        );
        if (!initTxSig) {
          throw new Error("Failed to obtain transaction signature for config initialization");
        }
        await withRetry(() =>
          connection.confirmTransaction(
            {
              signature: initTxSig as string,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            "confirmed"
          )
        );
        console.log("Config initialization complete, transaction signature:", initTxSig);
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
      promptBump = bump;

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
      if (!initTxSig) {
        throw new Error("Failed to obtain transaction signature for mint initialization");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: initTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
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
      if (!createTxSig) {
        throw new Error("Failed to obtain transaction signature for prompt creation");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: createTxSig as string,
            blockhash: createBlockhash.blockhash,
            lastValidBlockHeight: createBlockhash.lastValidBlockHeight
          },
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
      assert.equal(decoded.bump, promptBump, "Bump should match");
      console.log(`Prompt Bump: expected ${promptBump}, actual ${decoded.bump}`);

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

      // Check if escrow token account exists
      const escrowAccountInfo = await withRetry(() => connection.getAccountInfo(escrowToken));
      let initEscrowTxSig: string | undefined;
      if (!escrowAccountInfo) {
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
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
          createEscrowAtaIx
        );

        let latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
        initEscrowTx.recentBlockhash = latestBlockhash.blockhash;
        initEscrowTx.feePayer = seller.publicKey;
        initEscrowTx.sign(seller);
        initEscrowTxSig = await withRetry(() =>
          connection.sendRawTransaction(initEscrowTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          })
        );
        if (!initEscrowTxSig) {
          throw new Error("Failed to obtain transaction signature for escrow initialization");
        }
        await withRetry(() =>
          connection.confirmTransaction(
            {
              signature: initEscrowTxSig as string,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            "confirmed"
          )
        );
        console.log("Escrow token account initialization complete, transaction signature:", initEscrowTxSig);
      } else {
        console.log("Escrow token account already initialized, skipping creation");
      }

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
          price: price
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

      let latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      listTx.recentBlockhash = latestBlockhash.blockhash;
      listTx.feePayer = seller.publicKey;
      listTx.sign(seller);
      const listTxSig = await withRetry(() =>
        connection.sendRawTransaction(listTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      if (!listTxSig) {
        throw new Error("Failed to obtain transaction signature for prompt listing");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: listTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
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
      if (!delistTxSig) {
        throw new Error("Failed to obtain transaction signature for prompt delisting");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: delistTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
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

  it("Buys and re-lists a prompt", async () => {
    try {
      // Load seller keypair from file
      const seller = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/Documents/projects/Rust/solana/partnership/prompt-hub-sol/prompt_marketplace/seller-keypair.json", "utf8")))
      );
      console.log("Seller Public Key:", seller.publicKey.toBase58());

      // Check seller balance
      const sellerBalance = await withRetry(() => connection.getBalance(seller.publicKey));
      console.log("Seller SOL Balance (initial):", sellerBalance / LAMPORTS_PER_SOL, "SOL");
      if (sellerBalance < 0.1 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Seller wallet ${seller.publicKey.toBase58()} has insufficient SOL (${sellerBalance / LAMPORTS_PER_SOL} SOL). ` +
          `Please fund it with at least 0.1 SOL using: ` +
          `solana transfer ${seller.publicKey.toBase58()} 0.1 --url https://api.devnet.solana.com`
        );
      }

      // Transfer the prompt NFT from admin to seller
      const sellerToken = getAssociatedTokenAddressSync(
        mintPubkey,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      // Create seller's token account
      const createSellerAtaIx = createAssociatedTokenAccountInstruction(
        admin.publicKey, // payer
        sellerToken,
        seller.publicKey,
        mintPubkey,
        TOKEN_PROGRAM_ID
      );

      // Transfer NFT from admin to seller
      const transferIx = createTransferInstruction(
        creatorToken,
        sellerToken,
        admin.publicKey,
        1,
        [],
        TOKEN_PROGRAM_ID
      );

      const transferTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        createSellerAtaIx,
        transferIx
      );

      let latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      transferTx.recentBlockhash = latestBlockhash.blockhash;
      transferTx.feePayer = admin.publicKey;
      transferTx.sign(admin);
      const transferTxSig = await withRetry(() =>
        connection.sendRawTransaction(transferTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      if (!transferTxSig) {
        throw new Error("Failed to obtain transaction signature for NFT transfer to seller");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: transferTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        )
      );
      console.log("NFT transferred to seller, transaction signature:", transferTxSig);

      const price = new BN(1_000_000_000); // 1 SOL
      // Load buyer keypair from file
      const buyer = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(process.env.HOME + "/Documents/projects/Rust/solana/partnership/prompt-hub-sol/prompt_marketplace/buyer-keypair.json", "utf8")))
      );
      console.log("Buyer Public Key:", buyer.publicKey.toBase58());

      // Check buyer balance
      const buyerBalance = await withRetry(() => connection.getBalance(buyer.publicKey));
      console.log("Buyer SOL Balance (initial):", buyerBalance / LAMPORTS_PER_SOL, "SOL");
      if (buyerBalance < 1.1 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Buyer wallet ${buyer.publicKey.toBase58()} has insufficient SOL (${buyerBalance / LAMPORTS_PER_SOL} SOL). ` +
          `Please fund it with at least 1.1 SOL using: ` +
          `solana transfer ${buyer.publicKey.toBase58()} 1.1 --url https://api.devnet.solana.com`
        );
      }

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

      // Compute Buyer Token Account (ATA) address
      const buyerToken = getAssociatedTokenAddressSync(
        mintPubkey,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      console.log("Buyer Token Address:", buyerToken.toBase58());

      // Expected discriminator for Listing account
      const expectedDiscriminator = Buffer.from(
        createHash("sha256").update("account:Listing").digest().slice(0, 8)
      );

      // Check if escrow token account exists
      const escrowAccountInfo = await withRetry(() => connection.getAccountInfo(escrowToken));
      let initEscrowTxSig: string | undefined;
      if (!escrowAccountInfo) {
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
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
          createEscrowAtaIx
        );

        latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
        initEscrowTx.recentBlockhash = latestBlockhash.blockhash;
        initEscrowTx.feePayer = seller.publicKey;
        initEscrowTx.sign(seller);
        initEscrowTxSig = await withRetry(() =>
          connection.sendRawTransaction(initEscrowTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          })
        );
        if (!initEscrowTxSig) {
          throw new Error("Failed to obtain transaction signature for escrow initialization");
        }
        await withRetry(() =>
          connection.confirmTransaction(
            {
              signature: initEscrowTxSig as string,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            "confirmed"
          )
        );
        console.log("Escrow token account initialization complete, transaction signature:", initEscrowTxSig);
      } else {
        console.log("Escrow token account already initialized, skipping creation");
      }

      // Check if buyer token account exists, initialize if not
      const buyerTokenInfoPre = await withRetry(() => connection.getAccountInfo(buyerToken));
      let initBuyerAtaTxSig: string | undefined;
      if (!buyerTokenInfoPre) {
        const createBuyerAtaIx = createAssociatedTokenAccountInstruction(
          buyer.publicKey, // payer
          buyerToken, // ATA address
          buyer.publicKey, // owner
          mintPubkey, // mint
          TOKEN_PROGRAM_ID
        );

        const initBuyerAtaTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          createBuyerAtaIx
        );

        latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
        initBuyerAtaTx.recentBlockhash = latestBlockhash.blockhash;
        initBuyerAtaTx.feePayer = buyer.publicKey;
        initBuyerAtaTx.sign(buyer);
        initBuyerAtaTxSig = await withRetry(() =>
          connection.sendRawTransaction(initBuyerAtaTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          })
        );
        if (!initBuyerAtaTxSig) {
          throw new Error("Failed to obtain transaction signature for buyer ATA initialization");
        }
        await withRetry(() =>
          connection.confirmTransaction(
            {
              signature: initBuyerAtaTxSig as string,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            "confirmed"
          )
        );
        console.log("Buyer token account initialization complete, transaction signature:", initBuyerAtaTxSig);
      } else {
        console.log("Buyer token account already initialized, skipping creation");
      }

      // Verify buyer token account state
      const buyerTokenState = await withRetry(() => getAccount(connection, buyerToken));
      console.log("Buyer Token Info (pre-buy):", {
        mint: buyerTokenState.mint.toBase58(),
        owner: buyerTokenState.owner.toBase58(),
        amount: buyerTokenState.amount.toString(),
        address: buyerToken.toBase58(),
        isInitialized: buyerTokenState.isInitialized,
        delegate: buyerTokenState.delegate?.toBase58() || "null",
        delegatedAmount: buyerTokenState.delegatedAmount.toString()
      });
      assert.equal(buyerTokenState.mint.toBase58(), mintPubkey.toBase58(), "Buyer token mint should match");
      assert.equal(buyerTokenState.owner.toBase58(), buyer.publicKey.toBase58(), "Buyer token owner should be buyer");
      assert.equal(buyerTokenState.amount.toString(), "0", "Buyer token amount should be 0 before purchase");

      // List prompt (to set up for buying)
      const listInstructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:list_prompt").digest().slice(0, 8)
      );
      const listInstructionData = Buffer.alloc(16);
      listPromptSchema.encode(
        {
          discriminator: listInstructionDiscriminator,
          price: price
        },
        listInstructionData
      );

      const listIx = new TransactionInstruction({
        keys: [
          { pubkey: listingPda, isSigner: false, isWritable: true }, // listing
          { pubkey: promptPda, isSigner: false, isWritable: false }, // prompt
          { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
          { pubkey: seller.publicKey, isSigner: true, isWritable: true }, // seller
          { pubkey: sellerToken, isSigner: false, isWritable: true }, // seller_token
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
      if (!listTxSig) {
        throw new Error("Failed to obtain transaction signature for prompt listing");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: listTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        )
      );
      console.log("Prompt listing complete, transaction signature:", listTxSig);

      // Record initial SOL balances
      const sellerBalanceBefore = await withRetry(() => connection.getBalance(seller.publicKey));
      const adminBalanceBefore = await withRetry(() => connection.getBalance(admin.publicKey));
      const creatorBalanceBefore = await withRetry(() => connection.getBalance(admin.publicKey)); // Creator is admin
      const buyerBalanceBefore = await withRetry(() => connection.getBalance(buyer.publicKey));
      console.log("Initial SOL Balances:", {
        seller: {
          publicKey: seller.publicKey.toBase58(),
          balance: sellerBalanceBefore / LAMPORTS_PER_SOL,
          lamports: sellerBalanceBefore
        },
        admin: {
          publicKey: admin.publicKey.toBase58(),
          balance: adminBalanceBefore / LAMPORTS_PER_SOL,
          lamports: adminBalanceBefore
        },
        creator: {
          publicKey: admin.publicKey.toBase58(),
          balance: creatorBalanceBefore / LAMPORTS_PER_SOL,
          lamports: creatorBalanceBefore
        },
        buyer: {
          publicKey: buyer.publicKey.toBase58(),
          balance: buyerBalanceBefore / LAMPORTS_PER_SOL,
          lamports: buyerBalanceBefore
        }
      });

      // Build buy_prompt instruction
      const buyInstructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:buy_prompt").digest().slice(0, 8)
      );
      const buyInstructionData = Buffer.alloc(8);
      buyPromptSchema.encode(
        {
          discriminator: buyInstructionDiscriminator,
        },
        buyInstructionData
      );

      const buyIxAccounts = [
        { pubkey: listingPda, isSigner: false, isWritable: true, name: "listing" },
        { pubkey: promptPda, isSigner: false, isWritable: false, name: "prompt" },
        { pubkey: new PublicKey("4wzdty85maw7Q6TZE8Z496DgJeFHwcA8HzmNMbBE8ivJ"), isSigner: false, isWritable: false, name: "config" },
        { pubkey: mintPubkey, isSigner: false, isWritable: false, name: "mint" },
        { pubkey: buyer.publicKey, isSigner: true, isWritable: true, name: "buyer" },
        { pubkey: seller.publicKey, isSigner: false, isWritable: true, name: "seller" },
        { pubkey: admin.publicKey, isSigner: false, isWritable: true, name: "admin" },
        { pubkey: admin.publicKey, isSigner: false, isWritable: true, name: "creator" },
        { pubkey: buyerToken, isSigner: false, isWritable: true, name: "buyer_token" },
        { pubkey: escrowToken, isSigner: false, isWritable: true, name: "escrow_token" },
        { pubkey: escrowAuthority, isSigner: false, isWritable: false, name: "escrow_authority" },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false, name: "system_program" },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false, name: "token_program" },
        { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false, name: "associated_token_program" }
      ];
      console.log("Buy Prompt Instruction Accounts:", buyIxAccounts.map(acc => ({
        name: acc.name,
        pubkey: acc.pubkey.toBase58(),
        isSigner: acc.isSigner,
        isWritable: acc.isWritable
      })));

      const buyIx = new TransactionInstruction({
        keys: buyIxAccounts.map(acc => ({
          pubkey: acc.pubkey,
          isSigner: acc.isSigner,
          isWritable: acc.isWritable
        })),
        programId,
        data: buyInstructionData,
      });

      const buyTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }), // Reverted to 1,000,000
        buyIx
      );

      latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      buyTx.recentBlockhash = latestBlockhash.blockhash;
      buyTx.feePayer = buyer.publicKey;
      buyTx.sign(buyer);
      console.log("Buy Transaction Details:", {
        recentBlockhash: buyTx.recentBlockhash,
        feePayer: buyTx.feePayer.toBase58(),
        instructions: buyTx.instructions.length,
        computeUnitPrice: 200000,
        computeUnitLimit: 1000000
      });
      const buyTxSig = await withRetry(() =>
        connection.sendRawTransaction(buyTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      if (!buyTxSig) {
        throw new Error("Failed to obtain transaction signature for buy prompt");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: buyTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        )
      );
      console.log("Prompt purchase complete, transaction signature:", buyTxSig);

      // Verify Listing account (after purchase)
      const listingAccountInfoPostBuy = await withRetry(() => connection.getAccountInfo(listingPda));
      assert(listingAccountInfoPostBuy, "Listing account should exist");
      const decodedListingPostBuy = listingSchema.decode(listingAccountInfoPostBuy.data);
      console.log("Listing Account (post-buy):", {
        mint: decodedListingPostBuy.mint.toBase58(),
        seller: decodedListingPostBuy.seller.toBase58(),
        price: Number(decodedListingPostBuy.price),
        isActive: decodedListingPostBuy.is_active,
        bump: decodedListingPostBuy.bump
      });
      assert.equal(decodedListingPostBuy.is_active, false, "Listing should be inactive");

      // Verify Escrow Token account (after purchase)
      const escrowTokenInfoPostBuy = await withRetry(() => getAccount(connection, escrowToken));
      console.log("Escrow Token Info (post-buy):", {
        mint: escrowTokenInfoPostBuy.mint.toBase58(),
        owner: escrowTokenInfoPostBuy.owner.toBase58(),
        amount: escrowTokenInfoPostBuy.amount.toString()
      });
      assert.equal(escrowTokenInfoPostBuy.amount.toString(), "0", "Escrow token amount should be 0");

      // Verify Buyer Token account (after purchase)
      const buyerTokenInfoPostBuy = await withRetry(() => getAccount(connection, buyerToken));
      console.log("Buyer Token Info (post-buy):", {
        mint: buyerTokenInfoPostBuy.mint.toBase58(),
        owner: buyerTokenInfoPostBuy.owner.toBase58(),
        amount: buyerTokenInfoPostBuy.amount.toString(),
        address: buyerToken.toBase58(),
        isInitialized: buyerTokenInfoPostBuy.isInitialized
      });
      assert.equal(buyerTokenInfoPostBuy.mint.toBase58(), mintPubkey.toBase58(), "Buyer token mint should match");
      assert.equal(buyerTokenInfoPostBuy.owner.toBase58(), buyer.publicKey.toBase58(), "Buyer token owner should be buyer");
      assert.equal(buyerTokenInfoPostBuy.amount.toString(), "1", "Buyer token amount should be 1");

      // Verify SOL balances (after purchase)
      const platformFee = (price.toNumber() * 1000) / 10000; // 10% fee (1000 bps)
      const royalty = (price.toNumber() * 500) / 10000; // 5% royalty (500 bps)
      const sellerAmount = price.toNumber() - platformFee - royalty;
      const sellerBalanceAfter = await withRetry(() => connection.getBalance(seller.publicKey));
      const adminBalanceAfter = await withRetry(() => connection.getBalance(admin.publicKey));
      const creatorBalanceAfter = await withRetry(() => connection.getBalance(admin.publicKey)); // Creator is admin
      const buyerBalanceAfter = await withRetry(() => connection.getBalance(buyer.publicKey));
      console.log("SOL Balances After Purchase:", {
        seller: {
          publicKey: seller.publicKey.toBase58(),
          balance: sellerBalanceAfter / LAMPORTS_PER_SOL,
          lamports: sellerBalanceAfter,
          expectedIncrease: sellerAmount,
          actualIncrease: sellerBalanceAfter - sellerBalanceBefore
        },
        admin: {
          publicKey: admin.publicKey.toBase58(),
          balance: adminBalanceAfter / LAMPORTS_PER_SOL,
          lamports: adminBalanceAfter,
          expectedIncrease: platformFee,
          actualIncrease: adminBalanceAfter - adminBalanceBefore
        },
        creator: {
          publicKey: admin.publicKey.toBase58(),
          balance: creatorBalanceAfter / LAMPORTS_PER_SOL,
          lamports: creatorBalanceAfter,
          expectedIncrease: royalty,
          actualIncrease: creatorBalanceAfter - creatorBalanceBefore
        },
        buyer: {
          publicKey: buyer.publicKey.toBase58(),
          balance: buyerBalanceAfter / LAMPORTS_PER_SOL,
          lamports: buyerBalanceAfter,
          expectedDecrease: price.toNumber(),
          actualDecrease: buyerBalanceBefore - buyerBalanceAfter
        }
      });

      // Approximate balance checks (accounting for transaction fees)
      assert.approximately(
        sellerBalanceAfter,
        sellerBalanceBefore + sellerAmount,
        100_000, // Allow 0.0001 SOL variance for fees
        `Seller balance should increase by seller amount (${sellerAmount} lamports)`
      );
      assert.approximately(
        adminBalanceAfter,
        adminBalanceBefore + platformFee + royalty, // Admin receives both (creator is admin)
        100_000,
        `Admin balance should increase by platform fee (${platformFee}) + royalty (${royalty})`
      );
      assert.approximately(
        buyerBalanceAfter,
        buyerBalanceBefore - price.toNumber(),
        1_000_000, // Increased tolerance to 0.001 SOL to account for transaction fees
        `Buyer balance should decrease by price (${price.toNumber()} lamports)`
      );

      // Re-list prompt (buyer becomes seller)
      const newSeller = buyer;
      const newPrice = new BN(1_500_000_000); // 1.5 SOL

      // Build re-list_prompt instruction
      const relistInstructionData = Buffer.alloc(16);
      listPromptSchema.encode(
        {
          discriminator: listInstructionDiscriminator,
          price: newPrice,
        },
        relistInstructionData
      );

      const relistIx = new TransactionInstruction({
        keys: [
          { pubkey: listingPda, isSigner: false, isWritable: true }, // listing
          { pubkey: promptPda, isSigner: false, isWritable: false }, // prompt
          { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
          { pubkey: newSeller.publicKey, isSigner: true, isWritable: true }, // seller (buyer)
          { pubkey: buyerToken, isSigner: false, isWritable: true }, // seller_token (buyer_token)
          { pubkey: escrowToken, isSigner: false, isWritable: true }, // escrow_token
          { pubkey: escrowAuthority, isSigner: false, isWritable: false }, // escrow_authority
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
        ],
        programId,
        data: relistInstructionData,
    });

      const relistTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        relistIx
      );

      latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      relistTx.recentBlockhash = latestBlockhash.blockhash;
      relistTx.feePayer = newSeller.publicKey;
      relistTx.sign(newSeller);
      const relistTxSig = await withRetry(() =>
        connection.sendRawTransaction(relistTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      if (!relistTxSig) {
        throw new Error("Failed to obtain transaction signature for prompt re-listing");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: relistTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        )
      );
      console.log("Prompt re-listing complete, transaction signature:", relistTxSig);

      // Verify Listing account (after re-listing)
      const listingAccountInfoPostRelist = await withRetry(() => connection.getAccountInfo(listingPda));
      assert(listingAccountInfoPostRelist, "Listing account should exist");
      const decodedListingPostRelist = listingSchema.decode(listingAccountInfoPostRelist.data);
      console.log("Listing Account (post-relist):", {
        mint: decodedListingPostRelist.mint.toBase58(),
        seller: decodedListingPostRelist.seller.toBase58(),
        price: Number(decodedListingPostRelist.price),
        isActive: decodedListingPostRelist.is_active,
        bump: decodedListingPostRelist.bump
      });
      assert.equal(decodedListingPostRelist.mint.toBase58(), mintPubkey.toBase58(), "Mint should match");
      assert.equal(decodedListingPostRelist.seller.toBase58(), newSeller.publicKey.toBase58(), "Seller should be buyer");
      assert.equal(Number(decodedListingPostRelist.price), newPrice.toNumber(), "Price should match new price");
      assert.equal(decodedListingPostRelist.is_active, true, "Listing should be active");
      assert.equal(decodedListingPostRelist.bump, listingBump, "Bump should match");

      // Verify Escrow Token account (after re-listing)
      const escrowTokenInfoPostRelist = await withRetry(() => getAccount(connection, escrowToken));
      console.log("Escrow Token Info (post-relist):", {
        mint: escrowTokenInfoPostRelist.mint.toBase58(),
        owner: escrowTokenInfoPostRelist.owner.toBase58(),
        amount: escrowTokenInfoPostRelist.amount.toString()
      });
      assert.equal(escrowTokenInfoPostRelist.amount.toString(), "1", "Escrow token amount should be 1");

      // Verify Buyer Token account (after re-listing)
      const buyerTokenInfoPostRelist = await withRetry(() => getAccount(connection, buyerToken));
      console.log("Buyer Token Info (post-relist):", {
        mint: buyerTokenInfoPostRelist.mint.toBase58(),
        owner: buyerTokenInfoPostRelist.owner.toBase58(),
        amount: buyerTokenInfoPostRelist.amount.toString()
      });
      assert.equal(buyerTokenInfoPostRelist.amount.toString(), "0", "Buyer token amount should be 0");
    } catch (err) {
      console.error("Test error:", err);
      throw err;
    }
  });

  it("Fails to buy prompt with insufficient funds", async () => {
    try {
      // Load seller keypair from file
      const seller = Keypair.fromSecretKey(
        Buffer.from(
          JSON.parse(
            fs.readFileSync(
              process.env.HOME + "/Documents/projects/Rust/solana/partnership/prompt-hub-sol/prompt_marketplace/seller-keypair.json",
              "utf8"
            )
          )
        )
      );
      console.log("Seller Public Key:", seller.publicKey.toBase58());

      // Load buyer keypair from file
      const buyer = Keypair.fromSecretKey(
        Buffer.from(
          JSON.parse(
            fs.readFileSync(
              process.env.HOME + "/Documents/projects/Rust/solana/partnership/prompt-hub-sol/prompt_marketplace/buyer-keypair.json",
              "utf8"
            )
          )
        )
      );
      console.log("Buyer Public Key:", buyer.publicKey.toBase58());

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
      const escrowToken = getAssociatedTokenAddressSync(mintPubkey, escrowAuthority, true, TOKEN_PROGRAM_ID);
      console.log("Escrow Token Address:", escrowToken.toBase58());

      // Compute Buyer Token Account (ATA) address
      const buyerToken = getAssociatedTokenAddressSync(mintPubkey, buyer.publicKey, false, TOKEN_PROGRAM_ID);
      console.log("Buyer Token Address:", buyerToken.toBase58());

      // Compute Seller Token Account (ATA) address
      const sellerToken = getAssociatedTokenAddressSync(mintPubkey, seller.publicKey, false, TOKEN_PROGRAM_ID);
      console.log("Seller Token Address:", sellerToken.toBase58());

      // Ensure buyer token account exists
      const buyerTokenInfo = await withRetry(() => connection.getAccountInfo(buyerToken));
      let initBuyerAtaTxSig: string | undefined;
      if (!buyerTokenInfo) {
        const createBuyerAtaIx = createAssociatedTokenAccountInstruction(
          buyer.publicKey,
          buyerToken,
          buyer.publicKey,
          mintPubkey,
          TOKEN_PROGRAM_ID
        );

        const initBuyerAtaTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          createBuyerAtaIx
        );

        let latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
        initBuyerAtaTx.recentBlockhash = latestBlockhash.blockhash;
        initBuyerAtaTx.feePayer = buyer.publicKey;
        initBuyerAtaTx.sign(buyer);
        initBuyerAtaTxSig = await withRetry(() =>
          connection.sendRawTransaction(initBuyerAtaTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          })
        );
        if (!initBuyerAtaTxSig) {
          throw new Error("Failed to obtain transaction signature for buyer ATA initialization");
        }
        await withRetry(() =>
          connection.confirmTransaction(
            {
              signature: initBuyerAtaTxSig as string,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            "confirmed"
          )
        );
        console.log("Buyer token account initialization complete, transaction signature:", initBuyerAtaTxSig);
      } else {
        console.log("Buyer token account already initialized, skipping creation");
      }

      // Delist the prompt to return the NFT to the buyer
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
          { pubkey: listingPda, isSigner: false, isWritable: true },
          { pubkey: promptPda, isSigner: false, isWritable: false },
          { pubkey: mintPubkey, isSigner: false, isWritable: false },
          { pubkey: buyer.publicKey, isSigner: true, isWritable: true }, // Seller is buyer from previous test
          { pubkey: buyerToken, isSigner: false, isWritable: true },
          { pubkey: escrowToken, isSigner: false, isWritable: true },
          { pubkey: escrowAuthority, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId,
        data: delistInstructionData,
    });

      const delistTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        delistIx
      );

      let latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      delistTx.recentBlockhash = latestBlockhash.blockhash;
      delistTx.feePayer = buyer.publicKey;
      delistTx.sign(buyer);
      const delistTxSig = await withRetry(() =>
        connection.sendRawTransaction(delistTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      if (!delistTxSig) {
        throw new Error("Failed to obtain transaction signature for prompt delisting");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: delistTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        )
      );
      console.log("Prompt delisting complete, transaction signature:", delistTxSig);

      // Verify buyer token account now has the NFT
      const buyerTokenState = await withRetry(() => getAccount(connection, buyerToken));
      console.log("Buyer Token Info (post-delist):", {
        mint: buyerTokenState.mint.toBase58(),
        owner: buyerTokenState.owner.toBase58(),
        amount: buyerTokenState.amount.toString(),
      });
      assert.equal(buyerTokenState.amount.toString(), "1", "Buyer token amount should be 1 after delisting");

      // Transfer the prompt NFT from buyer back to seller
      const transferBackIx = createTransferInstruction(
        buyerToken,
        sellerToken,
        buyer.publicKey,
        1,
        [],
        TOKEN_PROGRAM_ID
      );

      const transferBackTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        transferBackIx
      );

      latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      transferBackTx.recentBlockhash = latestBlockhash.blockhash;
      transferBackTx.feePayer = buyer.publicKey;
      transferBackTx.sign(buyer);
      const transferBackTxSig = await withRetry(() =>
        connection.sendRawTransaction(transferBackTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
      );
      if (!transferBackTxSig) {
        throw new Error("Failed to obtain transaction signature for NFT transfer back to seller");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: transferBackTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        )
      );
      console.log("NFT transferred back to seller, transaction signature:", transferBackTxSig);

      // List prompt by seller
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
          { pubkey: listingPda, isSigner: false, isWritable: true },
          { pubkey: promptPda, isSigner: false, isWritable: false },
          { pubkey: mintPubkey, isSigner: false, isWritable: false },
          { pubkey: seller.publicKey, isSigner: true, isWritable: true },
          { pubkey: sellerToken, isSigner: false, isWritable: true },
          { pubkey: escrowToken, isSigner: false, isWritable: true },
          { pubkey: escrowAuthority, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
      if (!listTxSig) {
        throw new Error("Failed to obtain transaction signature for prompt listing");
      }
      await withRetry(() =>
        connection.confirmTransaction(
          {
            signature: listTxSig as string,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        )
      );
      console.log("Prompt listing complete, transaction signature:", listTxSig);

      // Reduce buyer's balance to simulate insufficient funds
      const buyerBalance = await withRetry(() => connection.getBalance(buyer.publicKey));
      console.log("Buyer SOL Balance (before reduction):", buyerBalance / LAMPORTS_PER_SOL, "SOL");
      if (buyerBalance > 0.05 * LAMPORTS_PER_SOL) {
        const tempKeypair = Keypair.generate();
        const transferAmount = buyerBalance - Math.floor(0.04 * LAMPORTS_PER_SOL); // Leave ~0.04 SOL
        console.log("Transferring", transferAmount / LAMPORTS_PER_SOL, "SOL to temp account:", tempKeypair.publicKey.toBase58());
        const transferIx = SystemProgram.transfer({
          fromPubkey: buyer.publicKey,
          toPubkey: tempKeypair.publicKey,
          lamports: transferAmount,
        });

        const reduceBalanceTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          transferIx
        );

        latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
        reduceBalanceTx.recentBlockhash = latestBlockhash.blockhash;
        reduceBalanceTx.feePayer = buyer.publicKey;
        reduceBalanceTx.sign(buyer);
        const reduceTxSig = await withRetry(() =>
          connection.sendRawTransaction(reduceBalanceTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          })
        );
        if (!reduceTxSig) {
          throw new Error("Failed to obtain transaction signature for balance reduction");
        }
        await withRetry(() =>
          connection.confirmTransaction(
            {
              signature: reduceTxSig as string,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            "confirmed"
          )
        );
        console.log("Buyer balance reduced, transaction signature:", reduceTxSig);
      }

      // Verify buyer's balance is now insufficient
      const buyerBalanceAfterReduction = await withRetry(() => connection.getBalance(buyer.publicKey));
      console.log("Buyer SOL Balance (after reduction):", buyerBalanceAfterReduction / LAMPORTS_PER_SOL, "SOL");
      assert(buyerBalanceAfterReduction < price.toNumber(), "Buyer balance should be less than price");

      // Build buy_prompt instruction
      const buyInstructionDiscriminator = Buffer.from(
        createHash("sha256").update("global:buy_prompt").digest().slice(0, 8)
      );
      const buyInstructionData = Buffer.alloc(8);
      buyPromptSchema.encode(
        {
          discriminator: buyInstructionDiscriminator,
        },
        buyInstructionData
      );

      const buyIx = new TransactionInstruction({
        keys: [
          { pubkey: listingPda, isSigner: false, isWritable: true },
          { pubkey: promptPda, isSigner: false, isWritable: false },
          { pubkey: new PublicKey("4wzdty85maw7Q6TZE8Z496DgJeFHwcA8HzmNMbBE8ivJ"), isSigner: false, isWritable: false },
          { pubkey: mintPubkey, isSigner: false, isWritable: false },
          { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
          { pubkey: seller.publicKey, isSigner: false, isWritable: true },
          { pubkey: admin.publicKey, isSigner: false, isWritable: true },
          { pubkey: admin.publicKey, isSigner: false, isWritable: true },
          { pubkey: buyerToken, isSigner: false, isWritable: true },
          { pubkey: escrowToken, isSigner: false, isWritable: true },
          { pubkey: escrowAuthority, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
        ],
        programId,
        data: buyInstructionData,
    });

      const buyTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        buyIx
      );

      latestBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      buyTx.recentBlockhash = latestBlockhash.blockhash;
      buyTx.feePayer = buyer.publicKey;
      buyTx.sign(buyer);

      // Expect the buy transaction to fail due to insufficient funds
      let buyTxSig: string | undefined;
      let error: Error | undefined;
      try {
        buyTxSig = await withRetry(() =>
          connection.sendRawTransaction(buyTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          })
        );
        if (!buyTxSig) {
          throw new Error("Failed to obtain transaction signature for buy prompt");
        }
        await withRetry(() =>
          connection.confirmTransaction(
            {
              signature: buyTxSig as string,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            "confirmed"
          )
        );
      } catch (err) {
        error = err as Error;
        console.log("Expected error caught:", error.message);
      }

      assert(error, "Buy transaction should have failed due to insufficient funds");
      assert(!buyTxSig || error, "Transaction should not have succeeded");

      // Verify buyer token account state (should not have received the NFT)
      const buyerTokenStatePost = await withRetry(() => getAccount(connection, buyerToken));
      console.log("Buyer Token Info (post-failed buy):", {
        mint: buyerTokenStatePost.mint.toBase58(),
        owner: buyerTokenStatePost.owner.toBase58(),
        amount: buyerTokenStatePost.amount.toString()
      });
      assert.equal(buyerTokenStatePost.amount.toString(), "0", "Buyer token amount should remain 0");
    } catch (err) {
      console.error("Test error:", err);
      throw err;
    }
  });
});