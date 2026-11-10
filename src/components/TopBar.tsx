'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/components/SidebarContext'

export default function TopBar() {
  const { toggle, isOpen } = useSidebar()
  const pathname = usePathname()
  const [expired, setExpired] = useState(0)
  const [week, setWeek] = useState(0)

  // Expiry alert counts — refreshed on navigation and every 5 minutes
  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/products/expiring?summary=1&days=7')
      .then(r => r.json())
      .then(d => { if (alive && d.data) { setExpired(Number(d.data.expired_count) || 0); setWeek(Number(d.data.week_count) || 0) } })
      .catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [pathname])

  const total = expired + week
  const title = total === 0
    ? 'No stock expiring in the next 7 days'
    : `${expired} expired · ${week} expiring within 7 days`

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border no-print">
      <div className="flex items-center gap-3 px-4 h-14">
        <button
          onClick={toggle}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-white hover:bg-surface2 transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {isOpen
              ? <><path d="M15 18l-6-6 6-6"/></>
              : <><path d="M4 6h16M4 12h16M4 18h16"/></>
            }
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-accent text-base tracking-tight truncate">Gorayo Wholesalers</h2>
        </div>

        <Link href="/reports/expiry" title={title} aria-label={`Expiry alerts: ${title}`}
          className={`relative flex items-center gap-2 h-9 px-2.5 rounded-lg transition-colors ${
            total > 0 ? 'text-red hover:bg-surface2' : 'text-muted hover:text-white hover:bg-surface2'
          }`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {total > 0 && (
            <>
              <span className="absolute -top-0.5 left-6 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: '#e96b6b', color: '#fff' }}>
                {total > 99 ? '99+' : total}
              </span>
              <span className="hidden sm:inline text-xs font-semibold ml-2">
                {expired > 0 ? `${expired} expired` : `${week} expiring`}
              </span>
            </>
          )}
        </Link>
      </div>
    </header>
  )
}
