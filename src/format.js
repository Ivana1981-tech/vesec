const kc = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kc0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })

export const money = (v) => (v === null || v === undefined || v === '' ? '' : kc.format(Number(v)))
export const money0 = (v) => kc0.format(Math.round(Number(v) || 0)) + ' Kč'
export const date = (v) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return `${Number(d)}. ${Number(m)}. ${y}`
}

export function display(col, v) {
  if (col.type === 'money') return money(v)
  if (col.type === 'date') return date(v)
  if (col.type === 'bool') return v ? 'ano' : 'ne'
  if (col.type === 'int') return v === null || v === undefined ? '' : String(v)
  if (col.type === 'select') return col.options.find((o) => o.value === v)?.label ?? (v || '')
  return v ?? ''
}

// Převod „1 234,50“ i „1234.5“ na číslo
export function parseMoney(s) {
  if (typeof s === 'number') return s
  const n = Number(String(s).replace(/\s/g, '').replace(/ /g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
