import anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { assert } from "chai";

const { Program, BN } = anchor;

describe("Prompt Marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const programId = new PublicKey("Ex1mC3Yr55mczVjk6aWmT75F3ZBUwH2BDeYSKx62fbvW");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const idlPath = join(__dirname, "..", "target", "idl", "prompt_marketplace.json");
  let idl;
  try {
    idl = JSON.parse(readFileSync(idlPath, "utf8"));
  } catch (e) {
    throw new Error(`Failed to load IDL: ${e instanceof Error ? e.message : String(e)}`);
  }
  const program = new Program(idl, provider);
  const admin = provider.wallet?.publicKey;

  it("Initializes or checks marketplace", async () => {
    try {
      if (!admin) {
        throw new Error("Admin wallet not found");
      }

      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
      );
      console.log("Config PDA:", configPda.toBase58());

      let accountInfo = await provider.connection.getAccountInfo(configPda);
      if (accountInfo) {
        console.log("Config account found, data length:", accountInfo.data.length);
        try {
          const configAccount = program.coder.accounts.decode("MarketplaceConfig", accountInfo.data);
          console.log("Config Account:", {
            admin: configAccount.admin.toBase58(),
            feeBps: Number(configAccount.feeBps),
            bump: configAccount.bump
          });
          // If decoding succeeds, verify data
          assert.equal(configAccount.admin.toBase58(), admin.toBase58(), "Admin should match");
          assert.equal(Number(configAccount.feeBps), 1000, "Fee should be 1000 bps");
          return; // Account is valid, test passes
        } catch (decodeErr) {
          console.log("Invalid MarketplaceConfig, closing account...");
          await program.methods
            .closeConfig()
            .accounts({
              config: configPda,
              admin,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          console.log("Invalid account closed");
        }
      } else {
        console.log("Config account not found");
      }

      // Initialize the account
      console.log("Initializing config account...");
      await program.methods
        .initialize(new BN(1000)) // 10% fee (1000 basis points)
        .accounts({
          config: configPda,
          admin,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Initialization complete");

      // Verify the new account
      accountInfo = await provider.connection.getAccountInfo(configPda);
      if (!accountInfo) {
        throw new Error("Config account not found after initialization");
      }
      console.log("Account data length:", accountInfo.data.length);
      const configAccount = program.coder.accounts.decode("MarketplaceConfig", accountInfo.data);
      console.log("Config Account:", {
        admin: configAccount.admin.toBase58(),
        feeBps: Number(configAccount.feeBps),
        bump: configAccount.bump
      });

      assert.equal(configAccount.admin.toBase58(), admin.toBase58(), "Admin should match");
      assert.equal(Number(configAccount.feeBps), 1000, "Fee should be 1000 bps");
    } catch (err) {
      console.error("Error:", err);
      if (err instanceof anchor.web3.SendTransactionError) {
        const logs = await err.getLogs(provider.connection);
        console.error("Transaction logs:", logs);
      }
      throw err;
    }
  });
});