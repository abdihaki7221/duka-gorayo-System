import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Gorayo Wholesalers',
  description: 'Wholesale & Retail Business Management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-bg text-white font-sans">
        <Toaster position="top-right" toastOptions={{
          style: { background: '#181c27', color: '#e8eaf0', border: '1px solid #2a3047' }
        }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
