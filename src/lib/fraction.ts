/**
 * Parse a denomination label and auto-calculate its fraction of 1 base unit.
 * Shared by the single "Add Stock" form and the Excel bulk upload.
 * Supports patterns like:
 *   "1/4 kg" → 0.25   (explicit fraction of base unit)
 *   "1 packet of 50 sweets" → 1/50 = 0.02  (1 item out of N total)
 *   "packet of 50" → 1/50 = 0.02
 *   "5 pieces from 100" → 5/100 = 0.05
 *   "250ml" → 0.25 (when base is litre)
 *   "500g" → 0.5 (when base is kg)
 */
export function autoCalcFraction(label: string, baseUnit: string): string | null {
  const l = String(label || '').toLowerCase().trim()
  if (!l) return null
  const clean = (n: number) => n.toFixed(6).replace(/\.?0+$/, '')

  // "packet of N" / "1 packet of N" / "item of N" → 1/N
  const ofNPattern = l.match(/(?:(\d+)\s+)?(?:packet|piece|item|sweet|stick|sachet|tab|unit)s?\s+(?:of|from|out\s+of)\s+(\d+)/i)
  if (ofNPattern) {
    const num = Number(ofNPattern[1] || 1)
    const denom = Number(ofNPattern[2])
    if (denom > 0) return clean(num / denom)
  }

  // "N/M" or "N÷M" at start
  const fracPattern = l.match(/^(\d+(?:\.\d+)?)\s*[/÷]\s*(\d+(?:\.\d+)?)/)
  if (fracPattern) {
    const result = Number(fracPattern[1]) / Number(fracPattern[2])
    if (isFinite(result) && result > 0) return clean(result)
  }

  // "N from M" / "N out of M"
  const fromPattern = l.match(/^(\d+(?:\.\d+)?)\s+(?:from|out\s+of)\s+(\d+(?:\.\d+)?)/)
  if (fromPattern) {
    const result = Number(fromPattern[1]) / Number(fromPattern[2])
    if (isFinite(result) && result > 0) return clean(result)
  }

  if (baseUnit === 'litre') {
    const mlMatch = l.match(/^(\d+(?:\.\d+)?)\s*ml/)
    if (mlMatch) return clean(Number(mlMatch[1]) / 1000)
    const lMatch = l.match(/^(\d+(?:\.\d+)?)\s*l(?:itre)?s?$/i)
    if (lMatch) return String(Number(lMatch[1]))
  }

  if (baseUnit === 'kg') {
    const gMatch = l.match(/^(\d+(?:\.\d+)?)\s*g(?:ram)?s?$/i)
    if (gMatch) return clean(Number(gMatch[1]) / 1000)
    const kgMatch = l.match(/^(\d+(?:\.\d+)?)\s*kg/i)
    if (kgMatch) return String(Number(kgMatch[1]))
  }

  return null
}
