import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'
import { Prompthubsol } from '../target/types/prompthubsol'

describe('prompthubsol', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const payer = provider.wallet as anchor.Wallet

  const program = anchor.workspace.Prompthubsol as Program<Prompthubsol>

  const prompthubsolKeypair = Keypair.generate()

  it('Initialize Prompthubsol', async () => {
    await program.methods
      .initialize()
      .accounts({
        prompthubsol: prompthubsolKeypair.publicKey,
        payer: payer.publicKey,
      })
      .signers([prompthubsolKeypair])
      .rpc()

    const currentCount = await program.account.prompthubsol.fetch(prompthubsolKeypair.publicKey)

    expect(currentCount.count).toEqual(0)
  })

  it('Increment Prompthubsol', async () => {
    await program.methods.increment().accounts({ prompthubsol: prompthubsolKeypair.publicKey }).rpc()

    const currentCount = await program.account.prompthubsol.fetch(prompthubsolKeypair.publicKey)

    expect(currentCount.count).toEqual(1)
  })

  it('Increment Prompthubsol Again', async () => {
    await program.methods.increment().accounts({ prompthubsol: prompthubsolKeypair.publicKey }).rpc()

    const currentCount = await program.account.prompthubsol.fetch(prompthubsolKeypair.publicKey)

    expect(currentCount.count).toEqual(2)
  })

  it('Decrement Prompthubsol', async () => {
    await program.methods.decrement().accounts({ prompthubsol: prompthubsolKeypair.publicKey }).rpc()

    const currentCount = await program.account.prompthubsol.fetch(prompthubsolKeypair.publicKey)

    expect(currentCount.count).toEqual(1)
  })

  it('Set prompthubsol value', async () => {
    await program.methods.set(42).accounts({ prompthubsol: prompthubsolKeypair.publicKey }).rpc()

    const currentCount = await program.account.prompthubsol.fetch(prompthubsolKeypair.publicKey)

    expect(currentCount.count).toEqual(42)
  })

  it('Set close the prompthubsol account', async () => {
    await program.methods
      .close()
      .accounts({
        payer: payer.publicKey,
        prompthubsol: prompthubsolKeypair.publicKey,
      })
      .rpc()

    // The account should no longer exist, returning null.
    const userAccount = await program.account.prompthubsol.fetchNullable(prompthubsolKeypair.publicKey)
    expect(userAccount).toBeNull()
  })
})
