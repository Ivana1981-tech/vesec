import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { display, money, parseMoney } from './format'

// Univerzální tabulka: editace v buňce, víceúrovňové třídění, filtry,
// seskupení se mezisoučty, přidání řádku, příznak „smazat“.
export default function DataTable({ table, cols, rows, setRows, title }) {
  const [sorts, setSorts] = useState([{ key: 'datum', dir: 'desc' }])
  const [filters, setFilters] = useState({})
  const [search, setSearch] = useState('')
  const [groups, setGroups] = useState(['', ''])
  const [showDeleted, setShowDeleted] = useState(false)
  const [editing, setEditing] = useState(null) // {id, key, value}
  const [adding, setAdding] = useState(null)
  const [err, setErr] = useState('')

  // ---------- třídění ----------
  function clickHeader(key, e) {
    setSorts((prev) => {
      const i = prev.findIndex((s) => s.key === key)
      if (!e.shiftKey) {
        if (i === 0 && prev.length === 1) {
          return prev[0].dir === 'asc' ? [{ key, dir: 'desc' }] : []
        }
        return [{ key, dir: 'asc' }]
      }
      // Shift + klik = další úroveň třídění
      if (i === -1) return [...prev, { key, dir: 'asc' }]
      if (prev[i].dir === 'asc') return prev.map((s, j) => (j === i ? { ...s, dir: 'desc' } : s))
      return prev.filter((_, j) => j !== i)
    })
  }

  function cmp(a, b, col) {
    const x = a[col.key], y = b[col.key]
    if (x === y) return 0
    if (x === null || x === undefined || x === '') return 1
    if (y === null || y === undefined || y === '') return -1
    if (col.type === 'money') return Number(x) - Number(y)
    if (col.type === 'bool') return (x ? 1 : 0) - (y ? 1 : 0)
    return String(display(col, x)).localeCompare(String(display(col, y)), 'cs')
  }

  // ---------- filtrování ----------
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let r = rows.filter((row) => showDeleted || !row.smazat)
    if (q) r = r.filter((row) => cols.some((c) => String(display(c, row[c.key])).toLowerCase().includes(q)))
    for (const c of cols) {
      const f = filters[c.key]
      if (!f) continue
      if (c.type === 'select' || c.type === 'bool') {
        if (f.eq !== undefined && f.eq !== '') r = r.filter((row) => String(row[c.key] ?? '') === f.eq)
      } else if (c.type === 'date') {
        if (f.from) r = r.filter((row) => row[c.key] && row[c.key] >= f.from)
        if (f.to) r = r.filter((row) => row[c.key] && row[c.key] <= f.to)
      } else if (c.type === 'money') {
        const mn = parseMoney(f.min), mx = parseMoney(f.max)
        if (f.min !== undefined && f.min !== '' && !isNaN(mn)) r = r.filter((row) => Number(row[c.key]) >= mn)
        if (f.max !== undefined && f.max !== '' && !isNaN(mx)) r = r.filter((row) => Number(row[c.key]) <= mx)
      } else if (f.text) {
        const t = f.text.toLowerCase()
        r = r.filter((row) => String(row[c.key] ?? '').toLowerCase().includes(t))
      }
    }
    const colOf = (k) => cols.find((c) => c.key === k)
    const g = groups.filter(Boolean)
    const order = [...g.map((k) => ({ key: k, dir: 'asc' })), ...sorts]
    return [...r].sort((a, b) => {
      for (const s of order) {
        const c = colOf(s.key)
        if (!c) continue
        const v = cmp(a, b, c)
        if (v) return s.dir === 'asc' ? v : -v
      }
      return 0
    })
  }, [rows, cols, filters, search, sorts, groups, showDeleted])

  const total = visible.reduce((s, r) => s + Number(r.castka || 0), 0)
  const filtersActive = search || Object.values(filters).some((f) => f && Object.values(f).some((v) => v !== '' && v !== undefined))

  // ---------- ukládání ----------
  function toDb(col, value) {
    if (col.type === 'money') {
      const n = parseMoney(value)
      if (isNaN(n)) throw new Error(`${col.label}: neplatné číslo`)
      if (col.positive && n <= 0) throw new Error(`${col.label}: musí být větší než 0`)
      return n
    }
    if (col.type === 'bool') return Boolean(value)
    if (value === '' || value === undefined) {
      if (col.required) throw new Error(`${col.label}: povinné pole`)
      return null
    }
    return value
  }

  async function saveCell(row, col, value) {
    setErr('')
    let v
    try { v = toDb(col, value) } catch (e) { setErr(e.message); return }
    if (v === row[col.key]) { setEditing(null); return }
    const { data, error } = await supabase.from(table).update({ [col.key]: v }).eq('id', row.id).select().single()
    if (error) { setErr('Uložení selhalo: ' + error.message); return }
    setRows((rs) => rs.map((r) => (r.id === row.id ? data : r)))
    setEditing(null)
  }

  async function toggleDelete(row) {
    setErr('')
    const { data, error } = await supabase.from(table).update({ smazat: !row.smazat }).eq('id', row.id).select().single()
    if (error) { setErr('Uložení selhalo: ' + error.message); return }
    setRows((rs) => rs.map((r) => (r.id === row.id ? data : r)))
  }

  function startAdd() {
    const blank = {}
    for (const c of cols) blank[c.key] = c.default ?? (c.type === 'date' && c.key === 'datum' ? new Date().toISOString().slice(0, 10) : c.type === 'bool' ? false : '')
    setAdding(blank)
  }

  async function saveNew() {
    setErr('')
    const rec = {}
    try { for (const c of cols) rec[c.key] = toDb(c, adding[c.key]) } catch (e) { setErr(e.message); return }
    const { data, error } = await supabase.from(table).insert(rec).select().single()
    if (error) { setErr('Uložení selhalo: ' + error.message); return }
    setRows((rs) => [data, ...rs])
    setAdding(null)
  }

  // ---------- vykreslení ----------
  function editor({ col, value, onChange, onCommit, onCancel, autoFocus }) {
    const keys = (e) => { if (e.key === 'Enter') onCommit?.(); if (e.key === 'Escape') onCancel?.() }
    if (col.type === 'select')
      return (
        <select autoFocus={autoFocus} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={onCommit} onKeyDown={keys}>
          {col.nullable && <option value="">—</option>}
          {col.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    if (col.type === 'bool')
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
    return (
      <input
        autoFocus={autoFocus}
        type={col.type === 'date' ? 'date' : 'text'}
        inputMode={col.type === 'money' ? 'decimal' : undefined}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={keys}
        className={col.type === 'money' ? 'num' : ''}
      />
    )
  }

  function cell(row, col) {
    if (col.type === 'bool')
      return <td key={col.key} className="c"><input type="checkbox" checked={Boolean(row[col.key])} onChange={(e) => saveCell(row, col, e.target.checked)} /></td>
    const isEd = editing && editing.id === row.id && editing.key === col.key
    if (isEd)
      return (
        <td key={col.key} className="editing">
          {editor({
            col,
            value: editing.value,
            autoFocus: true,
            onChange: (v) => setEditing((e) => ({ ...e, value: v })),
            onCommit: () => saveCell(row, col, editing.value),
            onCancel: () => setEditing(null),
          })}
        </td>
      )
    const raw = row[col.key]
    const start = () => setEditing({ id: row.id, key: col.key, value: col.type === 'money' ? String(raw ?? '').replace('.', ',') : raw ?? '' })
    return (
      <td key={col.key} className={(col.type === 'money' ? 'num ' : '') + (col.wide ? 'wide' : '')} onClick={start} title="Klikni pro úpravu">
        {display(col, raw)}
      </td>
    )
  }

  // Seskupené řádky s mezisoučty
  const body = []
  const g = groups.filter(Boolean)
  const colOf = (k) => cols.find((c) => c.key === k)
  if (g.length === 0) {
    visible.forEach((r) => body.push({ type: 'row', row: r }))
  } else {
    let prev = []
    visible.forEach((r, idx) => {
      const vals = g.map((k) => r[k] ?? '')
      g.forEach((k, level) => {
        if (prev[level] !== vals[level] || g.slice(0, level).some((_, l) => prev[l] !== vals[l])) {
          const members = visible.filter((x) => g.slice(0, level + 1).every((kk, l) => (x[kk] ?? '') === vals[l]))
          body.push({
            type: 'group', level, key: `${idx}-${level}`,
            label: `${colOf(k).label}: ${display(colOf(k), r[k]) || '(nevyplněno)'}`,
            count: members.length,
            sum: members.reduce((s, x) => s + Number(x.castka || 0), 0),
          })
        }
      })
      prev = vals
      body.push({ type: 'row', row: r })
    })
  }

  const groupable = cols.filter((c) => c.type !== 'money' && c.type !== 'date' && c.key !== 'popis' && c.key !== 'poznamka')

  return (
    <div className="page">
      <div className="page-head">
        <h1>{title}</h1>
        <button className="primary" onClick={startAdd} disabled={!!adding}>+ Přidat záznam</button>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Hledat ve všech sloupcích…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label>Seskupit podle
          <select value={groups[0]} onChange={(e) => setGroups([e.target.value, e.target.value ? groups[1] : ''])}>
            <option value="">—</option>
            {groupable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        {groups[0] && (
          <label>a pak
            <select value={groups[1]} onChange={(e) => setGroups([groups[0], e.target.value])}>
              <option value="">—</option>
              {groupable.filter((c) => c.key !== groups[0]).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}
        <label className="chk"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> zobrazit označené ke smazání</label>
        {filtersActive && <button onClick={() => { setFilters({}); setSearch('') }}>Zrušit filtry</button>}
      </div>

      <div className="hint">
        Třídění: klik na záhlaví · <b>Shift + klik</b> přidá další úroveň.
        {sorts.length > 0 && <> Teď: {sorts.map((s, i) => `${i + 1}. ${colOf(s.key)?.label} ${s.dir === 'asc' ? '↑' : '↓'}`).join(', ')}</>}
      </div>

      {err && <div className="error">{err}</div>}

      {adding && (
        <div className="addform">
          {cols.map((c) => (
            <label key={c.key} className={c.wide ? 'wide' : ''}>
              {c.label}{c.required ? ' *' : ''}
              {editor({ col: c, value: adding[c.key], onChange: (v) => setAdding((a) => ({ ...a, [c.key]: v })) })}
            </label>
          ))}
          <div className="actions">
            <button className="primary" onClick={saveNew}>Uložit</button>
            <button onClick={() => { setAdding(null); setErr('') }}>Zrušit</button>
          </div>
        </div>
      )}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {cols.map((c) => {
                const i = sorts.findIndex((s) => s.key === c.key)
                return (
                  <th key={c.key} onClick={(e) => clickHeader(c.key, e)} className={c.type === 'money' ? 'num' : ''}>
                    {c.label}
                    {i >= 0 && <span className="sort">{sorts[i].dir === 'asc' ? '↑' : '↓'}{sorts.length > 1 ? i + 1 : ''}</span>}
                  </th>
                )
              })}
              <th title="Označit ke smazání">Smazat</th>
            </tr>
            <tr className="filters">
              {cols.map((c) => {
                const f = filters[c.key] || {}
                const set = (patch) => setFilters((fs) => ({ ...fs, [c.key]: { ...f, ...patch } }))
                if (c.type === 'select' || c.type === 'bool') {
                  const opts = c.type === 'bool' ? [{ value: 'true', label: 'ano' }, { value: 'false', label: 'ne' }] : c.options
                  return (
                    <th key={c.key}>
                      <select value={f.eq ?? ''} onChange={(e) => set({ eq: e.target.value })}>
                        <option value="">vše</option>
                        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </th>
                  )
                }
                if (c.type === 'date')
                  return (
                    <th key={c.key} className="range">
                      <input type="date" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value })} title="od" />
                      <input type="date" value={f.to ?? ''} onChange={(e) => set({ to: e.target.value })} title="do" />
                    </th>
                  )
                if (c.type === 'money')
                  return (
                    <th key={c.key} className="range">
                      <input placeholder="od" value={f.min ?? ''} onChange={(e) => set({ min: e.target.value })} />
                      <input placeholder="do" value={f.max ?? ''} onChange={(e) => set({ max: e.target.value })} />
                    </th>
                  )
                return (
                  <th key={c.key}>
                    <input placeholder="filtr" value={f.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
                  </th>
                )
              })}
              <th />
            </tr>
          </thead>
          <tbody>
            {body.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="empty">Žádné záznamy</td></tr>
            )}
            {body.map((b) =>
              b.type === 'group' ? (
                <tr key={'g' + b.key} className={'group l' + b.level}>
                  <td colSpan={cols.findIndex((c) => c.key === 'castka')}>{b.label} <span className="muted">({b.count})</span></td>
                  <td className="num">{money(b.sum)}</td>
                  <td colSpan={cols.length - cols.findIndex((c) => c.key === 'castka')} />
                </tr>
              ) : (
                <tr key={b.row.id} className={b.row.smazat ? 'deleted' : ''}>
                  {cols.map((c) => cell(b.row, c))}
                  <td className="c"><input type="checkbox" checked={b.row.smazat} onChange={() => toggleDelete(b.row)} /></td>
                </tr>
              )
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={cols.findIndex((c) => c.key === 'castka')}>Celkem ({visible.length} záznamů{filtersActive ? ', filtrováno' : ''})</td>
              <td className="num">{money(total)}</td>
              <td colSpan={cols.length - cols.findIndex((c) => c.key === 'castka')} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
