// Shared expiry helpers (client + server safe — no DB imports here)

export const EXPIRY_PRESETS = [
  { days: 7, label: 'Next 1 week' },
  { days: 30, label: 'Next 1 month' },
  { days: 90, label: 'Next 3 months' },
  { days: 180, label: 'Next 6 months' },
]

export type ExpiryLevel = 'expired' | 'critical' | 'soon' | 'upcoming' | 'ok' | 'none'

/** Classify a product by days left until expiry. */
export function expiryLevel(daysLeft: number | null | undefined): ExpiryLevel {
  if (daysLeft === null || daysLeft === undefined || isNaN(Number(daysLeft))) return 'none'
  const d = Number(daysLeft)
  if (d < 0) return 'expired'
  if (d <= 7) return 'critical'
  if (d <= 30) return 'soon'
  if (d <= 180) return 'upcoming'
  return 'ok'
}

export function expiryBadgeClass(level: ExpiryLevel) {
  switch (level) {
    case 'expired': return 'badge-red'
    case 'critical': return 'badge-red'
    case 'soon': return 'badge-yellow'
    case 'upcoming': return 'badge-blue'
    case 'ok': return 'badge-green'
    default: return 'badge-gray'
  }
}

/** Human text like "Expired 3 days ago", "Expires today", "12 days left". */
export function expiryText(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined || isNaN(Number(daysLeft))) return 'No expiry'
  const d = Number(daysLeft)
  if (d < -1) return `Expired ${Math.abs(d)} days ago`
  if (d === -1) return 'Expired yesterday'
  if (d === 0) return 'Expires today'
  if (d === 1) return 'Expires tomorrow'
  return `${d} days left`
}

/** Format a YYYY-MM-DD string without timezone drift. */
export function fmtExpiry(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

/** SQL expression for "today" in Kenya (Neon runs in UTC). */
export const SQL_TODAY_NAIROBI = "(NOW() AT TIME ZONE 'Africa/Nairobi')::date"

/**
 * Validate an expiry value coming from an API body.
 * '' / null → null (clear), undefined → undefined (leave unchanged),
 * 'YYYY-MM-DD' → the same string. Throws on anything else.
 */
export function cleanExpiryInput(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const s = String(v).slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    if (dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3]) return s
  }
  throw new Error(`Invalid expiry date "${String(v)}" — use YYYY-MM-DD`)
}
