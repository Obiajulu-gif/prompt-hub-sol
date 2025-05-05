import anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PublicKey, SystemProgram } from "@solana/web3.js";
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

  it("Initializes the marketplace", async () => {
    try {
      if (!admin) {
        throw new Error("Admin wallet not found");
      }

      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
      );

      await program.methods
        .initialize(new BN(1000)) // 10% fee (1000 basis points)
        .accounts({
          config: configPda,
          admin,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const accountInfo = await provider.connection.getAccountInfo(configPda);
      if (!accountInfo) {
        throw new Error("Config account not found");
      }
      const configAccount = program.coder.accounts.decode("MarketplaceConfig", accountInfo.data);
      assert.equal(configAccount.admin.toBase58(), admin.toBase58(), "Admin should match");
      assert.equal(Number(configAccount.feeBps), 1000, "Fee should be 1000 bps");
    } catch (err) {
      console.error("Transaction failed:", err);
      if (err instanceof anchor.web3.SendTransactionError) {
        const logs = await err.getLogs(provider.connection);
        console.error("Transaction logs:", logs);
      }
      throw err;
    }
  });
});