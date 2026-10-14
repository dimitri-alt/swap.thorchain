# Private swaps (Houdini)

The third tab on the swap form. A private swap is not a THORChain or Maya swap: it is routed through [Houdini Swap](https://houdiniswap.com) in its
_private_ mode — two centralized-exchange hops, optionally through Monero, with no on-chain link between the deposit and the payout. The user sends a
deposit to an address Houdini hands out and Houdini pays the receiving address, so no wallet connection is needed on any chain; a connected wallet is
only a convenience that signs the deposit.

## Where the pieces live

```
PRIVATE tab ──quote──▶ api.thorchain.org/v1/quote  providers: ["HOUDINI"]  ──▶ Houdini partner API (server-side key)
                                     │  dry: indicative price + limits
                                     │  non-dry: creates the Houdini order → deposit address, exact amount, QR, houdiniId
             ──track──▶ api.thorchain.org/v1/track  provider: HOUDINI, providerSwapId: <houdiniId>
```

- **SDK** — `ProviderName.HOUDINI`, the `meta.houdini` and `qrCodeDataURL` fields on a quote route, and `@tcswap/plugins/houdini`,
  whose `swap()` is a plain `wallet.transfer` of `route.sellAmount` to `route.inboundAddress` (with `route.memo` when the order needs a deposit memo).
- **This app** — `isPrivateSwap` in `src/store/limit-swap-store.ts` (the tab; each mode's setter clears the other, re-exported from
  `src/store/private-swap-store.ts`), `AppConfig.privateProvider`,
  `useModeAssets` / `isAssetInMode` in `src/hooks/use-assets.ts` (each tab has its own asset list; `PRIVATE_SWAP_CHAINS` limits Houdini's catalogue to
  chains this app can validate addresses for and show), `useQuote` (quotes the private provider alone), and the `HOUDINI` branches in the recipient /
  confirm / deposit / wallet dialogs and the history dialog. The tab itself carries no explanatory block: what a private route costs in time and what
  its limits are come from the quote, and the confirm screen is where they are stated.

## The flow, step by step

1. **Quote** — `useQuote` asks for `providers: [HOUDINI]` without streaming options. The dry route carries `meta.houdini.{quoteId, min, max, swapName,
   markup}`, and an amount outside the route's limits comes back as a quote error the form shows like any other.
2. **Addresses** — `SwapRecipient` asks for the receiving address only. Without a wallet no refund address is asked for up front (a failed order is
   recovered through Houdini support, the order page); only when every route needs one does the aggregator answer "needs a refund address" and
   the refund field appear for the retry. With a wallet the source address is the refund address.
3. **Order** — the non-dry quote creates the Houdini order. `inboundAddress` is the deposit address, `sellAmount` is the exact amount the order expects
   (Houdini restates it with the venue's rounding), `expiration` is when the unfunded order lapses (~30 minutes), `meta.houdini.houdiniId` is the order
   id. Without a wallet the route also carries `qrCodeDataURL`; `InstantSwapDialog` shows it exactly like a memoless deposit. With a wallet
   `SwapDialog` confirms and `uSwap.swap` runs the Houdini plugin.
4. **Tracking** — the transaction stores `providerSwapId` (the order id) and `useSyncTransactions` sends it on `/track`. The history dialog links to the
   public order page (`app.houdiniswap.com/order-details?houdiniId=<id>`), which also carries Houdini's support chat.

## What is deliberately different from a native swap

- **Floating rate.** The payout is re-priced when the deposit lands. The confirm screen shows _Rate: Floating_ and the route instead of the minimum
  payout and slippage tolerance; price impact stays, as the USD cost of the route. A more-than-2% cost still needs the acknowledgement checkbox, with
  private-specific wording.
- **No halts.** Mimir halts stop THORChain and Maya, not Houdini; the halt banner and the greyed-out assets only apply on the other tabs.
- **No XRP sells; a memo for exchange destinations.** A CEX deposit on XRP is identified by a destination tag and the SDK's XRP toolbox only
  carries free-text memos, so the aggregator refuses XRP as the sell asset. Buying works to any address: when the buy chain is one Houdini marks
  `memoNeeded` (Cosmos, XRP, THORChain, TON — `houdiniMemoKind` in `src/lib/swap-helpers.ts`), `SwapRecipient` offers one optional
  _Memo/Tag/Comment_ field (an XRP tag must be a whole number up to 4294967295; otherwise at most 64 characters). It goes to the aggregator as
  `destinationMemo`, which hands it to Houdini as the order's `destinationTag`, and the confirm screen shows it. The aggregator refuses a
  `destinationMemo` unless the request is limited to `providers: ["HOUDINI"]`. The Send dialog's Private Send tab offers the same field under its
  recipient address (`send.tsx`, passed through `privateSendQuote`).
- **Private send (Send mode).** Houdini routes an asset to itself (BTC → BTC to an unlinked address), a sizeable share of private
  volume. The tab opens with a _Swap | Send_ switch (`SwapPrivateMode`, `isPrivateSend` in `src/store/limit-swap-store.ts`) so users find it
  without having to pick one token twice. In Send mode the buy side follows the sell side (`setAssetFrom` / `setAssetTo` in
  `src/store/swap-store.ts` set both), the flip arrow and the buy-side asset picker are hidden, and the inputs read _Send_ / _Recipient Gets_. A same-asset pair exists only
  in Send mode: in the tab's Swap mode picking the other side's asset switches Send on (a same-asset pair *is* a private send), on the
  other tabs it flips the pair, and leaving Send (or the tab) restores a distinct buy asset — the
  effect in `swap.tsx` also corrects a same-asset pair rehydrated from storage. The `/sell-<asset>-buy-<asset>` URL is never
  rewritten to a same-asset pair (`useUrlParams`): the mode is not in the URL, so it keeps the last real pair, and leaving Send restores
  that buy asset (`urlBuyAsset`).
  The aggregator quotes and orders such a pair through Houdini's dedicated private-send endpoints (`GET /quotes/private-send`,
  `POST /exchanges/private-send`) and marks the route `meta.houdini.type: "private-send"`; the app labels it _Send_ /
  _Confirm Private Send_ (`isPrivateSend` in `src/lib/swap-helpers.ts`). Not every private-swap asset can be sent privately — Houdini needs at
  least two venues for it (`hasSelfPrivate`) — and one that cannot comes back as a quote error rather than being hidden from the list.
  Without a wallet, a private send asks for the receiving address only, like Houdini's own Send tab: a floating order needs no refund
  address, so a failed send is recovered through Houdini support (the order page) rather than refunded automatically. With a wallet the
  source address is still passed as the refund address. The aggregator then only picks routes that can do without one; when every route
  needs one it answers "needs a refund address", and `SwapRecipient` shows the refund field for the retry.
- **Private Send in the wallet Send dialog.** The Send dialog (`src/components/send/send.tsx`, opened from the wallet sidebar) has
  _Send | Private Send_ tabs. Private Send is the same same-asset Houdini order as the swap form's Send mode (`src/components/send/send-private.ts`):
  the token picker offers only tokens on Houdini's list, the amount gets a dry quote (_Recipient Gets_, estimated time), and _Send Privately_
  places the order (non-dry quote, the sending wallet as refund address) and pays its deposit. The deposit is the Houdini plugin's transfer, but
  signed through `uSwap.getWallet(account.provider, chain)` — `uSwap.swap` would use whichever wallet connected the chain last, not the account
  the dialog is sending from. The transaction is recorded like a swap-form private send, so history and tracking treat both the same; the
  disclaimer acknowledgement is shared with the PRIVATE tab.
- **Deposit memos.** When the order needs a deposit memo (ATOM, TON, RUNE to a venue that uses one) it arrives as `route.memo`, is stored on the
  transaction as `depositMemo`, and is shown beside the QR code — which then encodes the bare address, as it does for any token deposit, since a
  payment URI cannot carry a memo and would read a token amount as native coin.
- **Tracking.** Houdini watches the deposit itself, so the app never expires a Houdini order on its local clock; it becomes *Expired* when Houdini
  says so, or when Houdini no longer knows the order (48h) and never saw a deposit.
- **Chains.** Houdini lists more chains than `PRIVATE_SWAP_CHAINS` (Monero, Stellar, Algorand, …). Adding one means an SDK address validator and a
  `public/networks/<chain>.svg` icon first.
- **Fees.** The aggregator charges its configured `HOUDINI` service/affiliate bps through Houdini's partner markup and reports them as fees in
  the sell asset.
