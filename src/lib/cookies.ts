import { parentCookieDomain } from '@/lib/cookie-domain'

const ONE_YEAR = 60 * 60 * 24 * 365

// "; Domain=.domain.org" so the cookie is shared across subdomains; empty for localhost / IPs
function domainAttr(): string {
  const domain = parentCookieDomain(window.location.hostname)
  return domain ? `; Domain=${domain}` : ''
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const match = document.cookie.split('; ').find(c => c.startsWith(prefix))
  return match ? decodeURIComponent(match.slice(prefix.length)) : null
}

export function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${domainAttr()}${secure}`
}

export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domainAttr()}`
}
