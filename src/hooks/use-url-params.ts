'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Asset } from '@/components/swap/asset'
import { useModeAssets } from '@/hooks/use-assets'
import { useIsPrivateSwap, useSetIsPrivateSwap } from '@/store/private-swap-store'
import { useSwapStore } from '@/store/swap-store'

const DEFAULT_SELL = 'BTC.BTC'
const DEFAULT_BUY = 'ETH.ETH'
const SELL = 'sell-'
const BUY = '-buy-'

const isNativeAsset = (asset: Asset) => asset.chain === asset.ticker && !asset.isSecuredAsset && !asset.isTradeAsset

// URL slug: bare ticker for gas assets, identifier without the contract-address suffix otherwise
const toSlug = (asset: Asset) => {
  if (isNativeAsset(asset)) return asset.ticker
  const { address, identifier } = asset
  if (!address) return identifier
  const suffix = `-${address.toLowerCase()}`
  return identifier.toLowerCase().endsWith(suffix) ? identifier.slice(0, identifier.length - suffix.length) : identifier
}

function parsePath(pathname: string): { sell: string | null; buy: string | null } {
  if (!pathname.startsWith(`/${SELL}`)) return { sell: null, buy: null }
  const rest = pathname.slice(1 + SELL.length)
  const idx = rest.indexOf(BUY)
  if (idx === -1) return { sell: null, buy: null }
  return {
    sell: decodeURIComponent(rest.slice(0, idx)),
    buy: decodeURIComponent(rest.slice(idx + BUY.length))
  }
}

function resolveAsset(assets: Asset[], token: string | null, fallback: string): Asset | undefined {
  if (token) {
    const lower = token.toLowerCase()
    const exact = assets.find(a => a.identifier.toLowerCase() === lower)
    if (exact) return exact
    const slugMatch = assets.find(a => toSlug(a).toLowerCase() === lower)
    if (slugMatch) return slugMatch
  }
  return assets.find(a => a.identifier === fallback)
}

const readPair = (pathname: string, params: Pick<URLSearchParams, 'get'>) =>
  pathname.startsWith('/widget') ? { sell: params.get('from'), buy: params.get('to') } : parsePath(pathname)

// The buy asset the address bar names. It is never rewritten to a same-asset (private send) pair,
// so it still holds the last real buy asset when Send mode or the PRIVATE tab is left.
export const urlBuyAsset = (assets: Asset[]) =>
  resolveAsset(assets, readPair(window.location.pathname, new URLSearchParams(window.location.search)).buy, DEFAULT_BUY)

export const useUrlParams = () => {
  const initialized = useRef(false)
  const skipNextSync = useRef(true)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isWidget = pathname.startsWith('/widget')
  const { assets } = useModeAssets()
  const { assetFrom, assetTo, hasHydrated, setAssetFrom, setAssetTo } = useSwapStore()
  const isPrivateSwap = useIsPrivateSwap()
  const setIsPrivateSwap = useSetIsPrivateSwap()
  const isPrivateUrl = searchParams.get('private') === 'true'
  // The store starts on SWAP (every visit is a full load), so only `?private=true` has a tab to apply
  const [urlTabApplied, setUrlTabApplied] = useState(!isPrivateUrl)

  // Init store from URL (once)
  useEffect(() => {
    if (initialized.current) return
    // `?private=true` opens the PRIVATE tab without waiting for the asset list; the pair is resolved on a later run, against that tab's list
    if (!urlTabApplied) {
      setUrlTabApplied(true)
      return setIsPrivateSwap(true)
    }
    if (!assets?.length || !hasHydrated) return

    const { sell, buy } = readPair(pathname, searchParams)
    const sellAsset = resolveAsset(assets, sell, DEFAULT_SELL)
    const buyAsset = resolveAsset(assets, buy, DEFAULT_BUY)

    if (sellAsset) setAssetFrom(sellAsset)
    if (buyAsset && buyAsset.identifier !== sellAsset?.identifier) setAssetTo(buyAsset)

    initialized.current = true
  }, [
    assets,
    hasHydrated,
    pathname,
    searchParams,
    isWidget,
    urlTabApplied,
    setAssetFrom,
    setAssetTo,
    setIsPrivateSwap
  ])

  // Sync URL on user-driven asset and tab changes (skip the first sync after init so `/` stays clean,
  // unless the tab was changed before init and the URL's flag is now stale)
  useEffect(() => {
    if (isWidget) return
    if (!initialized.current || !assetFrom || !assetTo) return
    const skip = skipNextSync.current
    skipNextSync.current = false
    if (skip && isPrivateSwap === isPrivateUrl) return
    // A same-asset pair exists only in the PRIVATE tab's Send mode, which the URL does not carry: opened
    // as a link it would land on Swap mode as an invalid pair, so the address keeps the last real pair.
    if (assetFrom.identifier === assetTo.identifier) return
    const newPath = `/${SELL}${toSlug(assetFrom)}${BUY}${toSlug(assetTo)}`
    const params = new URLSearchParams(window.location.search)
    if (isPrivateSwap) params.set('private', 'true')
    else params.delete('private')
    const search = params.toString()
    const newUrl = search ? `${newPath}?${search}` : newPath
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState(window.history.state, '', newUrl)
    }
  }, [assetFrom, assetTo, isPrivateSwap, isPrivateUrl, isWidget])

  // The tab to render: the URL's until it is in the store, so the server and the first client
  // render already show it instead of switching after load
  return urlTabApplied ? isPrivateSwap : isPrivateUrl
}
