import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PromptMarketplace } from "../target/types/prompt_marketplace";
import { assert } from "chai";

describe("prompt_marketplace", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.PromptMarketplace as Program<PromptMarketplace>;
  const owner = anchor.web3.Keypair.generate();
  const buyer = anchor.web3.Keypair.generate();
  
  let listingPda: anchor.web3.PublicKey;
  let bump: number;

  before(async () => {
    // Airdrop SOL to owner and buyer for testing
    const tx = await provider.connection.requestAirdrop(owner.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(tx);

    const tx2 = await provider.connection.requestAirdrop(buyer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(tx2);
  });

  it("Creates a listing", async () => {
    const [pda, pdaBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), owner.publicKey.toBuffer()],
      program.programId
    );
    listingPda = pda;
    bump = pdaBump;

    const title = "Test Prompt";
    const description = "This is a test prompt.";
    const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
    const category = "AI";
    const fileHash = "QmHash123"; // Example IPFS hash

    await program.methods.createListing(title, description, price, category, fileHash)
      .accounts({
        listing: listingPda,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    // Fetch the account to verify its data
    const listingAccount = await program.account.promptListing.fetch(listingPda);
    
    assert.strictEqual(listingAccount.title, title);
    assert.strictEqual(listingAccount.description, description);
    assert.strictEqual(listingAccount.price.toString(), price.toString());
    assert.strictEqual(listingAccount.category, category);
    assert.strictEqual(listingAccount.fileHash, fileHash);
    assert.strictEqual(listingAccount.owner.toBase58(), owner.publicKey.toBase58());
  });

  it("Updates the listing", async () => {
    const newTitle = "Updated Prompt";
    const newDescription = "This is an updated description.";
    const newPrice = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);
    const newCategory = "Blockchain";

    await program.methods.updateListing(newTitle, newDescription, newPrice, newCategory)
      .accounts({
        listing: listingPda,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    // Fetch updated listing
    const updatedListing = await program.account.promptListing.fetch(listingPda);

    assert.strictEqual(updatedListing.title, newTitle);
    assert.strictEqual(updatedListing.description, newDescription);
    assert.strictEqual(updatedListing.price.toString(), newPrice.toString());
    assert.strictEqual(updatedListing.category, newCategory);
  });

  it("Purchases a prompt", async () => {
    // Get balances before transaction
    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
    const ownerBalanceBefore = await provider.connection.getBalance(owner.publicKey);

    await program.methods.purchasePrompt()
      .accounts({
        listing: listingPda,
        buyer: buyer.publicKey,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    // Get balances after transaction
    const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
    const ownerBalanceAfter = await provider.connection.getBalance(owner.publicKey);
    
    // Ensure SOL was transferred
    assert(buyerBalanceAfter < buyerBalanceBefore, "Buyer should have less SOL");
    assert(ownerBalanceAfter > ownerBalanceBefore, "Owner should have received SOL");

    // Fetch updated listing to check sales count
    const updatedListing = await program.account.promptListing.fetch(listingPda);
    assert.strictEqual(updatedListing.sales, 1);
    assert.strictEqual(updatedListing.revenue.toString(), updatedListing.price.toString());
  });

  it("Closes the listing", async () => {
    await program.methods.closeListing()
      .accounts({
        listing: listingPda,
        owner: owner.publicKey,
        user: owner.publicKey, // Closing funds go to the owner
      })
      .signers([owner])
      .rpc();

    // Try fetching the closed account
    let errorThrown = false;
    try {
      await program.account.promptListing.fetch(listingPda);
    } catch (error) {
      errorThrown = true;
    }

    assert.isTrue(errorThrown, "The listing should be closed and no longer exist.");
  });
});
