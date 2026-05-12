export function fmt(n: number | string) {
  return 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtNum(n: number | string) {
  return Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

export function today() {
  return new Date().toISOString().split('T')[0]
}

export function genReceiptNo() {
  const ts = Date.now().toString().slice(-6)
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `RCP-${ts}-${rnd}`
}
