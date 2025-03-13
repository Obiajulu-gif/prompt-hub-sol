'use client'

import { getPrompthubsolProgram, getPrompthubsolProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, Keypair, PublicKey } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import toast from 'react-hot-toast'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../ui/ui-layout'

export function usePrompthubsolProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getPrompthubsolProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getPrompthubsolProgram(provider, programId), [provider, programId])

  const accounts = useQuery({
    queryKey: ['prompthubsol', 'all', { cluster }],
    queryFn: () => program.account.prompthubsol.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const initialize = useMutation({
    mutationKey: ['prompthubsol', 'initialize', { cluster }],
    mutationFn: (keypair: Keypair) =>
      program.methods.initialize().accounts({ prompthubsol: keypair.publicKey }).signers([keypair]).rpc(),
    onSuccess: (signature) => {
      transactionToast(signature)
      return accounts.refetch()
    },
    onError: () => toast.error('Failed to initialize account'),
  })

  return {
    program,
    programId,
    accounts,
    getProgramAccount,
    initialize,
  }
}

export function usePrompthubsolProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const { program, accounts } = usePrompthubsolProgram()

  const accountQuery = useQuery({
    queryKey: ['prompthubsol', 'fetch', { cluster, account }],
    queryFn: () => program.account.prompthubsol.fetch(account),
  })

  const closeMutation = useMutation({
    mutationKey: ['prompthubsol', 'close', { cluster, account }],
    mutationFn: () => program.methods.close().accounts({ prompthubsol: account }).rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accounts.refetch()
    },
  })

  const decrementMutation = useMutation({
    mutationKey: ['prompthubsol', 'decrement', { cluster, account }],
    mutationFn: () => program.methods.decrement().accounts({ prompthubsol: account }).rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accountQuery.refetch()
    },
  })

  const incrementMutation = useMutation({
    mutationKey: ['prompthubsol', 'increment', { cluster, account }],
    mutationFn: () => program.methods.increment().accounts({ prompthubsol: account }).rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accountQuery.refetch()
    },
  })

  const setMutation = useMutation({
    mutationKey: ['prompthubsol', 'set', { cluster, account }],
    mutationFn: (value: number) => program.methods.set(value).accounts({ prompthubsol: account }).rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accountQuery.refetch()
    },
  })

  return {
    accountQuery,
    closeMutation,
    decrementMutation,
    incrementMutation,
    setMutation,
  }
}
