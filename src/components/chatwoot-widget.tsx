'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { useTheme } from 'next-themes'
import { MessageCircle } from 'lucide-react'
import type { Locale } from '@/i18n/config'

// Live chat, backed by the Website inbox on support.thorchain.org.
//
// LAZY LOADING: the SDK script is injected only when the user asks for support
// (footer button from md up, the launcher bubble below md). Booting it on
// every page visit makes Chatwoot create an anonymous contact session per
// visitor — hundreds per day of bot and crawler sessions that never chat.
// Loading on demand means Chatwoot sessions are created only for users who
// clicked Support; Chatwoot's own pre-chat form (email required, configured
// in the inbox) then gates the conversation and attaches the email.
const BASE_URL = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL
const WEBSITE_TOKEN = process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN

const SCRIPT_ID = 'chatwoot-sdk'

// Our locales mapped onto Chatwoot's own widget translations; the ones it does
// not cover fall back to English.
const WIDGET_LOCALES: Record<Locale, string> = {
  en: 'en',
  zh: 'zh_CN',
  'zh-Hant': 'zh_TW',
  ko: 'ko',
  ru: 'ru',
  es: 'es',
  fa: 'fa',
  tr: 'tr',
  hi: 'hi',
  ar: 'ar',
  fr: 'fr',
  bn: 'en',
  pt: 'pt',
  ja: 'ja',
  lah: 'en',
  ur: 'en',
  id: 'id',
  de: 'de',
  it: 'it',
  pcm: 'en',
  arz: 'ar',
  vi: 'vi',
  th: 'th',
  'en-Runr': 'en'
}

// Chatwoot's own bubble is hidden at every width: below md the launcher button
// rendered by <ChatwootWidget /> replaces it (the SDK — and with it Chatwoot's
// bubble — does not exist until the first support click), from md up the
// footer button does. Injected by the widget component itself (rendered in the
// root layout) so the rule also applies on routes without a footer: /about,
// /contact, /developers and /widget.
export const WIDGET_BUBBLE_CSS = `
.woot-widget-bubble { display: none !important; }
@media (min-width: 768px) {
  .woot-widget-holder { bottom: 60px !important; max-height: calc(100vh - 76px) !important; }
}
`

declare global {
  interface Window {
    chatwootSettings?: Record<string, unknown>
    chatwootSDK?: { run: (options: { websiteToken: string; baseUrl: string }) => void }
    $chatwoot?: {
      toggle: (state?: 'open' | 'close') => void
      toggleBubbleVisibility: (visibility: 'show' | 'hide') => void
      setLocale: (locale: string) => void
      setColorScheme: (scheme: 'light' | 'dark' | 'auto') => void
      setCustomAttributes: (attributes: Record<string, unknown>) => void
      reset: () => void
    }
  }
}

/** Whether a Website inbox is configured, i.e. whether live chat exists at all. */
export const isChatwootEnabled = Boolean(BASE_URL && WEBSITE_TOKEN)

// --- Lazy SDK loading --------------------------------------------------------

// The loader runs on user action, so it reads the locale of that moment rather
// than of the initial render.
let currentWidgetLocale = 'en'
let currentColorScheme: 'light' | 'dark' = 'light'

let sdkLoading = false
let pendingOpen = false

function injectSdk() {
  if (!BASE_URL || !WEBSITE_TOKEN) return
  if (sdkLoading || document.getElementById(SCRIPT_ID) || window.$chatwoot) return
  sdkLoading = true

  // `run` reads its options off the window, so this has to be set first.
  window.chatwootSettings = {
    position: 'right',
    type: 'standard',
    // Boot-time option only knows 'light' and 'auto' (the OS setting), so a dark
    // site theme is applied by `setColorScheme` on `chatwoot:ready`.
    darkMode: currentColorScheme === 'dark' ? 'auto' : 'light',
    locale: currentWidgetLocale,
    showPopoutButton: true
  }

  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.src = `${BASE_URL}/packs/js/sdk.js`
  script.async = true
  script.defer = true
  script.onload = () => {
    window.chatwootSDK?.run({ websiteToken: WEBSITE_TOKEN, baseUrl: BASE_URL })
    if (window.$chatwoot) markSdkReady()
  }
  // Drop the tag (and the loading flag) so a later attempt retries rather than
  // assuming it loaded.
  script.onerror = () => {
    console.error('[chatwoot] Widget SDK failed to load from', BASE_URL)
    sdkLoading = false
    pendingOpen = false
    script.remove()
  }
  document.head.appendChild(script)
}

// Set once `run()` has installed `window.$chatwoot`, the point `toggle()` starts
// working. Deliberately not the `chatwoot:ready` event, which only fires after
// the widget iframe's round trip to the host — seconds later.
let sdkReady = false
const readyListeners = new Set<() => void>()

function markSdkReady() {
  if (sdkReady) return
  sdkReady = true
  // The click that triggered the load wanted the panel open — open it now.
  if (pendingOpen) {
    pendingOpen = false
    window.$chatwoot?.toggle('open')
  }
  for (const listener of readyListeners) listener()
}

/**
 * Toggles the chat panel; on the first call loads the SDK and opens the panel
 * once it has booted (~1s). Chatwoot's own pre-chat form (with the required
 * email field) shows inside the panel for new conversations. No argument, so
 * the SDK flips its own `isOpen` whenever it is already running.
 */
export function toggleChatwoot() {
  if (window.$chatwoot) {
    window.$chatwoot.toggle()
    return
  }
  pendingOpen = true
  injectSdk()
}

/**
 * Whether the chat panel is open. The SDK dispatches no open/close event to the
 * host page, so this watches the `woot--hide` class it toggles on the panel —
 * which also catches closes that did not come from our button.
 */
export function useChatwootOpen() {
  const isReady = useChatwootReady()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isReady) return

    const holder = document.querySelector('.woot-widget-holder')
    if (!holder) return

    const sync = () => setIsOpen(!holder.classList.contains('woot--hide'))
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(holder, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [isReady])

  return isOpen
}

/**
 * Whether the SDK booted, so callers can avoid rendering a state that assumes
 * a running widget. With lazy loading this is false until the first support
 * click; the entry buttons themselves must NOT wait for it.
 */
export function useChatwootReady() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!isChatwootEnabled) return
    if (sdkReady || window.$chatwoot) return setIsReady(true)

    const listener = () => setIsReady(true)
    readyListeners.add(listener)
    return () => {
      readyListeners.delete(listener)
    }
  }, [])

  return isReady
}

export function ChatwootWidget() {
  const locale = useLocale() as Locale
  const { resolvedTheme } = useTheme()
  const isOpen = useChatwootOpen()

  const widgetLocale = WIDGET_LOCALES[locale] ?? 'en'
  const colorScheme = resolvedTheme === 'dark' ? 'dark' : 'light'

  // Keep the live locale available to the loader (which runs on user action,
  // possibly after locale switches) and push locale/theme into the iframe
  // whenever they change once it exists.
  useEffect(() => {
    currentWidgetLocale = widgetLocale
    currentColorScheme = colorScheme
    window.$chatwoot?.setLocale(widgetLocale)
    window.$chatwoot?.setColorScheme(colorScheme)
  }, [widgetLocale, colorScheme])

  // The iframe ignores locale/theme pushed before it booted, so push the live
  // values again once it is ready. Also a backstop: if `run()` installs
  // $chatwoot slightly after script.onload, this still flips the ready state.
  useEffect(() => {
    const onReady = () => {
      if (!window.$chatwoot) return
      window.$chatwoot.setLocale(currentWidgetLocale)
      window.$chatwoot.setColorScheme(currentColorScheme)
      markSdkReady()
    }
    window.addEventListener('chatwoot:ready', onReady)
    return () => window.removeEventListener('chatwoot:ready', onReady)
  }, [])

  if (!isChatwootEnabled) return null

  return (
    <>
      <style>{WIDGET_BUBBLE_CSS}</style>
      {/* Mobile launcher: below md there is no footer, and Chatwoot's own
          bubble does not exist until the SDK loads — which now happens only
          after this button is clicked. */}
      {!isOpen && (
        <button
          type="button"
          aria-label="Open support chat"
          onClick={toggleChatwoot}
          className="bg-swap-bloc text-txt-high-contrast fixed right-4 bottom-4 z-40 flex size-12 cursor-pointer items-center justify-center rounded-full border shadow-lg transition-transform hover:scale-105 md:hidden"
        >
          <MessageCircle className="size-6" />
        </button>
      )}
    </>
  )
}
