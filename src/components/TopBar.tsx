'use client'
import { useSidebar } from '@/components/SidebarContext'

export default function TopBar() {
  const { toggle, isOpen } = useSidebar()

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
      </div>
    </header>
  )
}
