'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { fmt } from '@/lib/utils'
import { fmtExpiry } from '@/lib/expiry'
import {
  CheckedProduct, MAX_BULK_ROWS, SELL_MODE_LABELS,
  buildStockTemplate, nairobiTodayYmd, parseStockWorkbook,
} from '@/lib/stockExcel'

async function loadExcelJS(): Promise<any> {
  const mod: any = await import('exceljs')
  return mod.default ?? mod
}

type View = 'all' | 'errors' | 'warnings'

export default function BulkStockUploadPage() {
  const [categories, setCategories] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [existingNames, setExistingNames] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [products, setProducts] = useState<CheckedProduct[] | null>(null)
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [view, setView] = useState<View>('all')
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<{ inserted: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function loadLookups() {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories((d.data || []).map((c: any) => c.name)))
    fetch('/api/suppliers').then(r => r.json()).then(d => setSuppliers((d.data || []).map((s: any) => s.name)))
    fetch('/api/products').then(r => r.json()).then(d => setExistingNames((d.data || []).map((p: any) => p.name)))
  }
  useEffect(() => { loadLookups() }, [])

  async function downloadTemplate() {
    setDownloading(true)
    try {
      const ExcelJS = await loadExcelJS()
      const buf = await buildStockTemplate(ExcelJS, { categories, suppliers })
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gorayo-stock-template-${nairobiTodayYmd()}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Template downloaded')
    } catch (e: any) {
      toast.error('Could not create the template: ' + (e.message || e))
    } finally { setDownloading(false) }
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('Please upload the .xlsx template (Excel workbook)')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is larger than 10 MB')
      return
    }
    setParsing(true)
    setResult(null)
    setFileName(file.name)
    try {
      const ExcelJS = await loadExcelJS()
      const res = await parseStockWorkbook(ExcelJS, await file.arrayBuffer(), {
        existingNames, todayYmd: nairobiTodayYmd(),
      })
      setProducts(res.products)
      setFileErrors(res.fileErrors)
      setView(res.products.some(p => p.errors.length) ? 'errors' : 'all')
    } catch (e: any) {
      toast.error('Could not read the file: ' + (e.message || e))
    } finally {
      setParsing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function importRows(rows: CheckedProduct[]) {
    if (!rows.length) return
    setImporting(true)
    try {
      const payload = rows.map(({ errors, warnings, ...p }) => p)
      const res = await fetch('/api/products/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: payload }),
      })
      const data = await res.json()
      if (res.status === 422 && Array.isArray(data.rowErrors)) {
        // Server found problems the preview missed (e.g. someone added the same product meanwhile)
        const byRow = new Map<number, string[]>(data.rowErrors.map((r: any) => [r.row, r.errors]))
        setProducts(prev => (prev || []).map(p => byRow.has(p.row) ? { ...p, errors: byRow.get(p.row)! } : p))
        setView('errors')
        throw new Error(data.error)
      }
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResult({ inserted: data.data.inserted })
      setProducts(null)
      setFileErrors([])
      loadLookups()
      toast.success(`${data.data.inserted} product(s) added to stock`)
    } catch (e: any) {
      toast.error(e.message)
    } finally { setImporting(false) }
  }

  const all = products || []
  const valid = all.filter(p => p.errors.length === 0)
  const withErrors = all.filter(p => p.errors.length > 0)
  const withWarnings = all.filter(p => p.errors.length === 0 && p.warnings.length > 0)
  const shown = view === 'errors' ? withErrors : view === 'warnings' ? withWarnings : all
  const totalCost = valid.reduce((a, p) => a + p.buy_price * p.qty + (p.transport_cost || 0), 0)

  return (
    <div className="animate-in max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Bulk Stock Upload</h1>
          <p className="page-sub">Add many products at once from an Excel template — same fields as Add Stock, including retail sizes, wholesale packs and expiry dates</p>
        </div>
        <Link href="/stock/add" className="btn btn-outline">➕ Add one product instead</Link>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="duka-card">
          <div className="text-xs text-accent font-bold uppercase tracking-wider mb-1">Step 1</div>
          <div className="text-white font-semibold mb-1">Download the template</div>
          <p className="text-muted text-xs mb-3">
            Dropdowns include your {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} and {suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}. Download a fresh copy after adding new ones.
          </p>
          <button className="btn btn-primary btn-full" onClick={downloadTemplate} disabled={downloading}>
            {downloading ? '⏳ Preparing...' : '⬇️ Download Excel template'}
          </button>
        </div>
        <div className="duka-card">
          <div className="text-xs text-accent font-bold uppercase tracking-wider mb-1">Step 2</div>
          <div className="text-white font-semibold mb-1">Fill it in Excel</div>
          <ul className="text-muted text-xs space-y-1 list-disc pl-4">
            <li><strong className="text-sub">Stock</strong> sheet — one row per product. Gold headers are required.</li>
            <li><strong className="text-sub">Retail Sizes</strong> sheet — one row per size (1/4 kg, 500ml…) for products sold retail.</li>
            <li>Quantity and buying price are per base unit, like the single form.</li>
            <li>Expiry date is optional (YYYY-MM-DD).</li>
          </ul>
        </div>
        <div className="duka-card">
          <div className="text-xs text-accent font-bold uppercase tracking-wider mb-1">Step 3</div>
          <div className="text-white font-semibold mb-1">Upload and review</div>
          <p className="text-muted text-xs">
            You will see every row checked before anything is saved. Up to {MAX_BULK_ROWS} products per file.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        className="duka-card mb-6 text-center cursor-pointer transition-colors"
        style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: dragOver ? '#f5c842' : undefined, padding: 32 }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
      >
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        <div className="text-3xl mb-2">{parsing ? '⏳' : '📄'}</div>
        <div className="text-white font-semibold">
          {parsing ? 'Checking your file...' : fileName && products ? `${fileName} — click to choose another file` : 'Drop the filled template here, or click to choose'}
        </div>
        <div className="text-muted text-xs mt-1">Excel workbook (.xlsx) · max 10 MB</div>
      </div>

      {/* Success */}
      {result && (
        <div className="duka-card mb-6" style={{ borderColor: 'rgba(62,207,142,0.5)', background: 'rgba(62,207,142,0.07)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-green font-semibold text-lg">✅ {result.inserted} product{result.inserted === 1 ? '' : 's'} added to stock</div>
              <div className="text-sub text-sm">Stock movements were recorded and new categories/suppliers were created where needed.</div>
            </div>
            <div className="flex gap-2">
              <Link href="/stock" className="btn btn-success">View stock</Link>
              <button className="btn btn-outline" onClick={() => { setResult(null); setFileName('') }}>Upload another</button>
            </div>
          </div>
        </div>
      )}

      {/* File-level problems */}
      {fileErrors.length > 0 && (
        <div className="duka-card mb-4" style={{ borderColor: 'rgba(233,107,107,0.5)' }}>
          <div className="text-red font-semibold mb-2">⚠️ Problems in the file</div>
          <ul className="text-sm text-sub space-y-1 list-disc pl-5">
            {fileErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Preview */}
      {products && products.length > 0 && (
        <div className="duka-card">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              <button className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('all')}>All {all.length}</button>
              <button className={`btn btn-sm ${view === 'errors' ? 'btn-danger' : 'btn-outline'}`} onClick={() => setView('errors')} disabled={!withErrors.length}>
                ✕ Errors {withErrors.length}
              </button>
              <button className={`btn btn-sm ${view === 'warnings' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('warnings')} disabled={!withWarnings.length}>
                ⚠ Warnings {withWarnings.length}
              </button>
              <span className="badge badge-green self-center">✓ Ready {valid.length}</span>
            </div>
            <div className="text-xs text-muted">
              Stock cost of ready rows: <span className="mono text-white">{fmt(totalCost)}</span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr>
                <th>Row</th><th>Product</th><th>Category</th><th>Mode</th><th>Qty</th>
                <th>Buy / unit</th><th>Wholesale</th><th>Retail sizes</th><th>Expiry</th><th>Check</th>
              </tr></thead>
              <tbody>
                {shown.map(p => {
                  const hasErr = p.errors.length > 0
                  return (
                    <tr key={p.row} style={hasErr ? { background: 'rgba(233,107,107,0.06)' } : undefined}>
                      <td className="mono text-xs text-muted">{p.row}</td>
                      <td>
                        <div className="text-white font-medium">{p.name || <span className="text-red">(no name)</span>}</div>
                        {p.supplier && <div className="text-xs text-muted">{p.supplier}</div>}
                      </td>
                      <td className="text-sm">{p.category}</td>
                      <td><span className="badge badge-gray">{SELL_MODE_LABELS[p.sell_mode] || p.sell_mode || '—'}</span></td>
                      <td className="mono text-sm">{isNaN(p.qty) ? '—' : p.qty} {p.base_unit}</td>
                      <td className="mono text-sm">{isNaN(p.buy_price) ? '—' : fmt(p.buy_price)}</td>
                      <td className="mono text-xs">
                        {p.sell_mode === 'denominations' ? '—' : (
                          <>
                            <div>{isNaN(p.ws_price) ? '—' : fmt(p.ws_price)} / {p.ws_pack_label || 'pack'}</div>
                            <div className="text-muted">{isNaN(p.ws_pack_qty) ? '?' : p.ws_pack_qty} {p.base_unit} per pack</div>
                          </>
                        )}
                      </td>
                      <td className="text-xs">
                        {p.denominations.length === 0 ? <span className="text-muted">—</span> : p.denominations.map((d, i) => (
                          <div key={i}>{d.label} <span className="text-muted">×{isNaN(d.fraction) ? '?' : d.fraction}</span> <span className="mono">{isNaN(d.sell_price) ? '?' : d.sell_price}</span></div>
                        ))}
                      </td>
                      <td className="mono text-xs">{p.expiry_date ? fmtExpiry(p.expiry_date) : '—'}</td>
                      <td style={{ minWidth: 220 }}>
                        {hasErr ? (
                          <ul className="text-xs text-red space-y-0.5">{p.errors.map((e, i) => <li key={i}>✕ {e}</li>)}</ul>
                        ) : <span className="badge badge-green">✓ Ready</span>}
                        {p.warnings.length > 0 && (
                          <ul className="text-xs text-yellow space-y-0.5 mt-1">{p.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 mt-5 pt-4 border-t border-border">
            {withErrors.length > 0 ? (
              <>
                <span className="text-sm text-sub sm:mr-auto">Fix the {withErrors.length} row(s) with errors in Excel and upload again — or import only the ready rows.</span>
                <button className="btn btn-outline" disabled={!valid.length || importing} onClick={() => importRows(valid)}>
                  {importing ? '⏳ Importing...' : `Import only the ${valid.length} ready row${valid.length === 1 ? '' : 's'}`}
                </button>
              </>
            ) : (
              <button className="btn btn-primary btn-lg" disabled={importing || !valid.length} onClick={() => importRows(valid)}>
                {importing ? '⏳ Importing...' : `💾 Import ${valid.length} product${valid.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
