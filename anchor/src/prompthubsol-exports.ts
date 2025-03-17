// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import PrompthubsolIDL from '../target/idl/prompt_marketplace.json'
import type { PromptMarketplace } from "../target/types/prompt_marketplace";

// Re-export the generated IDL and type
export { PromptMarketplace, PrompthubsolIDL };

// The programId is imported from the program IDL.
export const PROMPTHUBSOL_PROGRAM_ID = new PublicKey(PrompthubsolIDL.address)

// This is a helper function to get the Prompthubsol Anchor program.
export function getPrompthubsolProgram(provider: AnchorProvider, address?: PublicKey) {
  return new Program({ ...PrompthubsolIDL, address: address ? address.toBase58() : PrompthubsolIDL.address } as Prompthubsol, provider)
}

// This is a helper function to get the program ID for the Prompthubsol program depending on the cluster.
export function getPrompthubsolProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Prompthubsol program on devnet and testnet.
      return new PublicKey('coUnmi3oBUtwtd9fjeAvSsJssXh5A5xyPbhpewyzRVF')
    case 'mainnet-beta':
    default:
      return PROMPTHUBSOL_PROGRAM_ID
  }
}
