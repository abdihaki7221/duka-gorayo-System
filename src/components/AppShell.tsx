'use client'
import { AuthProvider, useAuth } from '@/components/AuthContext'
import { SidebarProvider, useSidebar } from '@/components/SidebarContext'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import LoginPage from '@/app/login/page'

function MainLayout({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar()

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className={`transition-all duration-200 ${isOpen ? 'lg:ml-64' : 'ml-0'}`}>
        <TopBar />
        <main className="p-4 sm:p-5 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-4 animate-pulse">
            <span className="text-3xl">🏪</span>
          </div>
          <p className="text-muted text-sm">Loading Gorayo Wholesalers...</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <SidebarProvider>
      <MainLayout>{children}</MainLayout>
    </SidebarProvider>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  )
}
