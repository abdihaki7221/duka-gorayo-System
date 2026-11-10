'use client'
import Link from 'next/link'
import ExpiryAlerts from '@/components/ExpiryAlerts'

export default function ExpiryReportPage() {
  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Expiry Report</h1>
          <p className="page-sub">Goods in stock that have expired or will expire soon — sell, discount or return them first</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Link href="/stock" className="btn btn-outline">📦 Stock</Link>
          <button className="btn btn-outline" onClick={() => window.print()}>🖨️ Print</button>
        </div>
      </div>
      <ExpiryAlerts defaultDays={30} />
      <p className="text-xs text-muted mt-3">
        Only products with stock remaining are listed. Set or change expiry dates from the Stock page (✏️ Edit), Add Stock, or the Excel bulk upload.
      </p>
    </div>
  )
}
