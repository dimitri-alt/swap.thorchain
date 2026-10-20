import type { Chain, WalletOption } from '@tcswap/core'
import { deleteCookie, readCookie, writeCookie } from '@/lib/cookies'

const WALLET_LINK_COOKIE = 'tc-wallet-link'

export interface WalletLink {
  provider: WalletOption
  chains: Chain[]
  // Per-chain derivation path so hardware wallets rehydrate the same account
  paths?: Partial<Record<Chain, number[]>>
}

export function readWalletLink(): WalletLink[] {
  try {
    const parsed = JSON.parse(readCookie(WALLET_LINK_COOKIE) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Group accounts by provider into the shared cookie, or clear it when empty.
export function writeWalletLink(accounts: Array<{ provider: WalletOption; network: Chain; derivationPath?: number[] }>): void {
  const byProvider = new Map<WalletOption, { chains: Set<Chain>; paths: Partial<Record<Chain, number[]>> }>()
  for (const { provider, network, derivationPath } of accounts) {
    const entry = byProvider.get(provider) ?? { chains: new Set<Chain>(), paths: {} }
    entry.chains.add(network)
    if (derivationPath) entry.paths[network] = derivationPath
    byProvider.set(provider, entry)
  }

  if (byProvider.size === 0) {
    deleteCookie(WALLET_LINK_COOKIE)
    return
  }

  const link: WalletLink[] = Array.from(byProvider, ([provider, { chains, paths }]) => ({
    provider,
    chains: [...chains],
    ...(Object.keys(paths).length > 0 ? { paths } : {})
  }))
  writeCookie(WALLET_LINK_COOKIE, JSON.stringify(link))
}
