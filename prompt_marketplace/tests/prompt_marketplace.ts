import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PublicKey, SystemProgram, ComputeBudgetProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { assert } from "chai";

const { Program, BN } = anchor;

describe("Prompt Marketplace", () => {
  const provider = new anchor.AnchorProvider(
    anchor.AnchorProvider.env().connection,
    anchor.AnchorProvider.env().wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const programId = new PublicKey("Hk3y7V6N67wsqxXxza8238vqntb5sQZZ5EDyNAEbSdZj");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const idlPath = join(__dirname, "..", "target", "idl", "prompt_marketplace.json");
  let idl;
  try {
    idl = JSON.parse(readFileSync(idlPath, "utf8"));
  } catch (e) {
    throw new Error(`Failed to load IDL: ${e instanceof Error ? e.message : String(e)}`);
  }
  const program = new Program(idl, programId, provider);
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
      console.log("Config PDA:", configPda.toBase58()); // Should be FGeJBRqN6a4zqKKBZ3tL2j2mZKWQkzLnrwZ8t9kLDEEU

      // Expected discriminator for 'Config' (sha256("account:Config")[:8])
      const expectedDiscriminator = Buffer.from([169, 22, 247, 131, 182, 200, 81, 124]);

      let accountInfo = await provider.connection.getAccountInfo(configPda);
      if (accountInfo) {
        console.log("Config account found, data length:", accountInfo.data.length);
        console.log("Raw account data (hex):", accountInfo.data.toString("hex"));
        const accountDiscriminator = accountInfo.data.slice(0, 8);
        if (!accountDiscriminator.equals(expectedDiscriminator)) {
          console.log("Wrong discriminator detected, attempting to close stale account...");
          try {
            const closeTx = await program.methods
              .closeConfig()
              .accounts({
                config: configPda,
                admin,
                systemProgram: SystemProgram.programId,
              })
              .rpc({ commitment: "confirmed" });
            console.log("Close transaction signature:", closeTx);
            await provider.connection.confirmTransaction(closeTx, "confirmed");
            console.log("Stale account closed");
          } catch (closeErr) {
            console.log("closeConfig failed, attempting manual close:", closeErr);
            const lamports = accountInfo.lamports;
            const closeIx = new TransactionInstruction({
              keys: [
                { pubkey: configPda, isSigner: false, isWritable: true },
                { pubkey: admin, isSigner: true, isWritable: true },
              ],
              programId: SystemProgram.programId,
              data: Buffer.from([2, ...new BN(lamports).toArray("le", 8)]),
            });
            const tx = new Transaction().add(
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }), // Priority fee
              ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
              closeIx
            );
            const closeTx = await provider.sendAndConfirm(tx, [], { skipPreflight: true, commitment: "confirmed" });
            console.log("Manual close transaction signature:", closeTx);
            await provider.connection.confirmTransaction(closeTx, "confirmed");
            console.log("Stale account manually closed");
          }
          accountInfo = await provider.connection.getAccountInfo(configPda);
        }
      }

      if (accountInfo) {
        console.log("Config account found, data length:", accountInfo.data.length);
        console.log("Raw account data (hex):", accountInfo.data.toString("hex"));
        const accountDiscriminator = accountInfo.data.slice(0, 8);
        assert(accountDiscriminator.equals(expectedDiscriminator), `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${accountDiscriminator.toString("hex")}`);
        const configAccount = program.coder.accounts.decode("Config", accountInfo.data);
        console.log("Config Account:", {
          admin: configAccount.admin.toBase58(),
          feeBps: Number(configAccount.feeBps),
          bump: configAccount.bump
        });
        assert.equal(configAccount.admin.toBase58(), admin.toBase58(), "Admin should match");
        assert.equal(Number(configAccount.feeBps), 1000, "Fee should be 1000 bps");
        return; // Account is valid, test passes
      } else {
        console.log("Config account not found, initializing...");
      }

      // Initialize the account
      console.log("Initializing config account...");
      const initTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }), // Priority fee
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        await program.methods
          .initialize(new BN(1000)) // 10% fee (1000 basis points)
          .accounts({
            config: configPda,
            admin,
            systemProgram: SystemProgram.programId,
          })
          .instruction()
      );
      const initTxSig = await provider.sendAndConfirm(initTx, [], { commitment: "confirmed", preflightCommitment: "confirmed" });
      console.log("Initialization complete, transaction signature:", initTxSig);
      await provider.connection.confirmTransaction(initTxSig, "confirmed");

      // Verify the new account
      accountInfo = await provider.connection.getAccountInfo(configPda);
      if (!accountInfo) {
        throw new Error("Config account not found after initialization");
      }
      console.log("Account data length:", accountInfo.data.length);
      console.log("Raw account data (hex):", accountInfo.data.toString("hex"));
      const accountDiscriminator = accountInfo.data.slice(0, 8);
      assert(accountDiscriminator.equals(expectedDiscriminator), `Invalid discriminator: expected ${expectedDiscriminator.toString("hex")}, got ${accountDiscriminator.toString("hex")}`);
      const configAccount = program.coder.accounts.decode("Config", accountInfo.data);
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