import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PromptMarketplace } from "./target/idl/prompt_marketplace.json";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import assert from "assert";

describe("prompt_marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PromptMarketplace as Program<PromptMarketplace>;
  const admin = provider.wallet.publicKey;
  const creator = Keypair.generate();
  const buyer = Keypair.generate();
  let mint: PublicKey;
  let creatorToken: PublicKey;
  let buyerToken: PublicKey;

  before(async () => {
    // Fund creator and buyer
    await provider.connection.requestAirdrop(creator.publicKey, 2e9);
    await provider.connection.requestAirdrop(buyer.publicKey, 2e9);
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for airdrop
  });

  it("Initializes marketplace", async () => {
    const config = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )[0];

    await program.methods
      .initialize(250) // 2.5% fee
      .accounts({
        config,
        admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const configAccount = await program.account.marketplaceConfig.fetch(config);
    assert.equal(configAccount.admin.toBase58(), admin.toBase58());
    assert.equal(configAccount.feeBps, 250);
  });

  it("Creates prompt", async () => {
    const mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;
    creatorToken = await createAccount(
      provider.connection,
      creator,
      mint,
      creator.publicKey
    );

    await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      creator.publicKey,
      0,
      mintKeypair
    );

    const prompt = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("prompt"), mint.toBuffer()],
      program.programId
    )[0];

    const metadata = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    )[0];

    await program.methods
      .createPrompt("https://arweave.net/abc", 500) // 5% royalty
      .accounts({
        prompt,
        mint,
        creatorToken,
        creator: creator.publicKey,
        metadata,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([creator])
      .rpc();

    const promptAccount = await program.account.prompt.fetch(prompt);
    assert.equal(promptAccount.mint.toBase58(), mint.toBase58());
    assert.equal(promptAccount.creator.toBase58(), creator.publicKey.toBase58());
    assert.equal(promptAccount.metadataUri, "https://arweave.net/abc");
    assert.equal(promptAccount.royaltyBps, 500);
  });

  it("Lists prompt", async () => {
    const listing = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), mint.toBuffer()],
      program.programId
    )[0];

    const escrowAuthority = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), mint.toBuffer()],
      program.programId
    )[0];

    const escrowToken = await createAccount(
      provider.connection,
      creator,
      mint,
      escrowAuthority
    );

    await program.methods
      .listPrompt(1_000_000_000) // 1 SOL
      .accounts({
        listing,
        prompt: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("prompt"), mint.toBuffer()],
          program.programId
        )[0],
        mint,
        seller: creator.publicKey,
        sellerToken: creatorToken,
        escrowToken,
        escrowAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const listingAccount = await program.account.listing.fetch(listing);
    assert.equal(listingAccount.mint.toBase58(), mint.toBase58());
    assert.equal(listingAccount.seller.toBase58(), creator.publicKey.toBase58());
    assert.equal(listingAccount.price, 1_000_000_000);
    assert.equal(listingAccount.isActive, true);
  });

  it("Buys prompt", async () => {
    const listing = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), mint.toBuffer()],
      program.programId
    )[0];

    const prompt = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("prompt"), mint.toBuffer()],
      program.programId
    )[0];

    const config = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )[0];

    const escrowAuthority = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), mint.toBuffer()],
      program.programId
    )[0];

    buyerToken = await createAccount(
      provider.connection,
      buyer,
      mint,
      buyer.publicKey
    );

    const escrowToken = (await provider.connection.getTokenAccountsByOwner(escrowAuthority, { mint }))[0].pubkey;

    await program.methods
      .buyPrompt()
      .accounts({
        listing,
        prompt,
        config,
        mint,
        buyer: buyer.publicKey,
        seller: creator.publicKey,
        admin,
        creator: creator.publicKey,
        buyerToken,
        escrowToken,
        escrowAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        listingBump: (await program.account.listing.fetch(listing)).bump,
        escrowBump: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("escrow"), mint.toBuffer()],
          program.programId
        )[1],
      })
      .signers([buyer])
      .rpc();

    const listingAccount = await program.account.listing.fetch(listing);
    assert.equal(listingAccount.isActive, false);

    const buyerTokenAccount = await provider.connection.getTokenAccountBalance(buyerToken);
    assert.equal(buyerTokenAccount.value.uiAmount, 1);
  });

  it("Delists prompt", async () => {
    // Re-list for testing delist
    const listing = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), mint.toBuffer()],
      program.programId
    )[0];

    const escrowAuthority = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), mint.toBuffer()],
      program.programId
    )[0];

    const escrowToken = await createAccount(
      provider.connection,
      creator,
      mint,
      escrowAuthority
    );

    await program.methods
      .listPrompt(1_000_000_000)
      .accounts({
        listing,
        prompt: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("prompt"), mint.toBuffer()],
          program.programId
        )[0],
        mint,
        seller: creator.publicKey,
        sellerToken: creatorToken,
        escrowToken,
        escrowAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    await program.methods
      .delistPrompt()
      .accounts({
        listing,
        prompt: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("prompt"), mint.toBuffer()],
          program.programId
        )[0],
        mint,
        seller: creator.publicKey,
        sellerToken: creatorToken,
        escrowToken,
        escrowAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const listingAccount = await program.account.listing.fetch(listing);
    assert.equal(listingAccount.isActive, false);

    const sellerTokenAccount = await provider.connection.getTokenAccountBalance(creatorToken);
    assert.equal(sellerTokenAccount.value.uiAmount, 1);
  });
});