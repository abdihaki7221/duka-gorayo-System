'use client'
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

interface SidebarContextType {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: false, open: () => {}, close: () => {}, toggle: () => {}
})

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  // On desktop (lg+), default to open
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsOpen(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsOpen(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(p => !p), [])

  return (
    <SidebarContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() { return useContext(SidebarContext) }
