'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthContext'
import { useSidebar } from '@/components/SidebarContext'

const navItems = [
  { section: 'Main' },
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/pos', label: 'New Sale', icon: '🧾' },
  { section: 'Inventory' },
  { href: '/stock', label: 'Stock', icon: '📦' },
  { href: '/stock/add', label: 'Add Stock', icon: '➕' },
  { section: 'Finance' },
  { href: '/sales', label: 'Sales History', icon: '💰' },
  { href: '/credit', label: 'Credit / Debtors', icon: '📋' },
  { href: '/expenses', label: 'Expenses', icon: '💸' },
  { href: '/cash', label: 'Cash / Safe', icon: '🔐', superOnly: false },
  { section: 'Reports' },
  { href: '/reports/daily', label: 'Daily Summary', icon: '📅' },
  { href: '/reports/monthly', label: 'Monthly Report', icon: '📈' },
  { section: 'Admin', superOnly: true },
  { href: '/users', label: 'User Management', icon: '👥', superOnly: true },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout, isSuperAdmin } = useAuth()
  const { isOpen, close } = useSidebar()

  function handleNavClick() {
    // On mobile, close sidebar after navigation
    if (window.innerWidth < 1024) close()
  }

  return (
    <>
      {/* Overlay backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <nav className={`
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-surface border-r border-border
        flex flex-col no-print transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="font-serif text-accent text-lg tracking-tight">Gorayo Wholesalers</h1>
            <p className="text-[10px] text-muted uppercase tracking-widest mt-0.5">Wholesale & Retail</p>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-white hover:bg-surface2 transition-colors"
            aria-label="Close sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {navItems.map((item, i) => {
            if ('section' in item && item.section) {
              if ((item as any).superOnly && !isSuperAdmin) return null
              return (
                <p key={i} className="text-[10px] text-muted uppercase tracking-widest px-3 pt-4 pb-1 mt-1">
                  {item.section}
                </p>
              )
            }
            if ((item as any).superOnly && !isSuperAdmin) return null
            const href = (item as any).href
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                onClick={handleNavClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all
                  ${active
                    ? 'bg-accent/10 text-accent'
                    : 'text-sub hover:bg-surface2 hover:text-white'
                  }`}
              >
                <span className="w-5 text-center text-base">{(item as any).icon}</span>
                {(item as any).label}
              </Link>
            )
          })}
        </div>

        {/* User + Logout */}
        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-bold shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                {user?.role === 'super_admin' ? '⭐ Super Admin' : '👤 Staff'}
              </p>
            </div>
          </div>
          <button onClick={() => { logout(); close() }}
            className="btn btn-ghost btn-sm w-full justify-center text-muted hover:text-red">
            🚪 Sign Out
          </button>
        </div>
      </nav>
    </>
  )
}
