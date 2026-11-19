import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import DataTable from './DataTable'
import { date as fmtDate } from './format'

const DAY = 86400000
const toD = (s) => (s ? new Date(s + 'T00:00:00') : null)
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * DAY)
const MESICE = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro']

export const HARM_COLS = [
  {
    key: 'verze', label: 'Verze', type: 'select', default: 'realita',
    options: [
      { value: 'ondra', label: 'Ondra (v02)' },
      { value: 'vzor', label: 'Vzor' },
      { value: 'realita', label: 'Realita' },
    ],
  },
  { key: 'poradi', label: 'Pořadí', type: 'int', required: true },
  { key: 'faze', label: 'Fáze', type: 'text', required: true, wide: true },
  { key: 'tyden_od', label: 'Týden od', type: 'int' },
  { key: 'tyden_do', label: 'Týden do', type: 'int' },
  { key: 'start', label: 'Začátek', type: 'date' },
  { key: 'konec', label: 'Konec', type: 'date' },
  { key: 'poznamka', label: 'Poznámka', type: 'text', wide: true },
]

// Vzor má týdny; skutečná data dopočítáme od data zahájení.
function vzorDates(row, zahajeni) {
  if (!zahajeni || !row.tyden_od) return [null, null]
  const s = addDays(zahajeni, (row.tyden_od - 1) * 7)
  const e = addDays(zahajeni, (row.tyden_do || row.tyden_od) * 7 - 1)
  return [s, e]
}

export default function Harmonogram({ rows, setRows, nastaveni, setNastaveni }) {
  const [show, setShow] = useState({ ondra: true, vzor: true, realita: true })
  const [err, setErr] = useState('')
  const [lockOndra, setLockOndra] = useState(true)
  const [drag, setDrag] = useState(null) // { verze, ids:Set, x0, trackW, delta }
  const dragRef = useRef(null)
  const zahajeniStr = nastaveni.find((n) => n.klic === 'zahajeni_vzor')?.hodnota || ''
  const zahajeni = toD(zahajeniStr)
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')

  async function saveZahajeni(v) {
    setErr('')
    const { data, error } = await supabase.from('nastaveni').update({ hodnota: v || null }).eq('klic', 'zahajeni_vzor').select().single()
    if (error) { setErr('Uložení selhalo: ' + error.message); return }
    setNastaveni((ns) => ns.map((n) => (n.klic === data.klic ? data : n)))
  }

  const live = rows.filter((r) => !r.smazat)
  const ondra = live.filter((r) => r.verze === 'ondra').sort((a, b) => a.poradi - b.poradi)
  const vzor = live.filter((r) => r.verze === 'vzor').sort((a, b) => a.poradi - b.poradi)
  const realita = live.filter((r) => r.verze === 'realita')

  // Řádky Ganttu
  const gOndra = ondra.map((r) => ({ id: r.id, label: r.faze, s: toD(r.start), e: toD(r.konec), note: r.poznamka }))
  const gVzor = vzor.map((r) => {
    const [s, e] = vzorDates(r, zahajeni)
    const real = realita.find((x) => x.poradi === r.poradi)
    const rs = toD(real?.start), re = toD(real?.konec)
    let skluz = null
    if (rs && s) skluz = Math.round((rs - s) / DAY)
    if (re && e) skluz = Math.round((re - e) / DAY)
    return { vid: r.id, rid: real?.id, label: r.faze, s, e, rs, re, skluz, note: r.poznamka }
  })
  const extraReal = realita
    .filter((x) => !vzor.some((v) => v.poradi === x.poradi))
    .map((x) => ({ rid: x.id, label: x.faze, rs: toD(x.start), re: toD(x.konec) }))

  // Rozsah osy
  const all = [
    ...(show.ondra ? gOndra.flatMap((g) => [g.s, g.e]) : []),
    ...(show.vzor ? gVzor.flatMap((g) => [g.s, g.e]) : []),
    ...(show.realita ? [...gVzor, ...extraReal].flatMap((g) => [g.rs, g.re]) : []),
    today,
  ].filter(Boolean)
  const min = new Date(Math.min(...all)), max = new Date(Math.max(...all))
  const axisStart = new Date(min.getFullYear(), min.getMonth(), 1)
  const axisEnd = new Date(max.getFullYear(), max.getMonth() + 1, 1)
  const span = (axisEnd - axisStart) / DAY
  const pct = (d) => ((d - axisStart) / DAY / span) * 100

  const months = useMemo(() => {
    const out = []
    let d = new Date(axisStart)
    while (d < axisEnd) {
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      out.push({ d, left: pct(d), width: pct(n) - pct(d) })
      d = n
    }
    return out
  }, [axisStart.getTime(), axisEnd.getTime()])

  // ---------- posouvání lišt ----------
  // Posune se chycená fáze a všechny fáze stejné verze, které začínají ve stejný den nebo později.
  function affected(verze, id) {
    const same = live.filter((r) => r.verze === verze)
    const me = same.find((r) => r.id === id)
    if (!me) return new Set()
    if (verze === 'vzor') return new Set(same.filter((r) => r.tyden_od != null && r.tyden_od >= me.tyden_od).map((r) => r.id))
    return new Set(same.filter((r) => r.start && r.start >= me.start).map((r) => r.id))
  }
  function onDown(e, verze, id) {
    if (!id || (verze === 'ondra' && lockOndra)) return
    e.preventDefault()
    const trackW = e.currentTarget.parentElement.getBoundingClientRect().width
    const d = { verze, id, ids: affected(verze, id), x0: e.clientX, trackW, delta: 0 }
    dragRef.current = d
    setDrag(d)
  }
  useEffect(() => {
    if (!drag) return
    const move = (e) => {
      const d = dragRef.current
      let days = Math.round(((e.clientX - d.x0) / d.trackW) * span)
      if (d.verze === 'vzor') {
        let w = Math.round(days / 7)
        const minOd = Math.min(...live.filter((r) => d.ids.has(r.id)).map((r) => r.tyden_od))
        if (minOd + w < 1) w = 1 - minOd
        days = w * 7
      }
      if (days !== d.delta) { d.delta = days; setDrag({ ...d }) }
    }
    const up = async () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d || !d.delta) return
      await persistShift(d)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [drag?.id, drag?.verze])

  async function persistShift(d) {
    setErr('')
    const targets = live.filter((r) => d.ids.has(r.id))
    const updates = targets.map((r) => {
      if (d.verze === 'vzor') {
        const w = d.delta / 7
        return { id: r.id, rec: { tyden_od: r.tyden_od + w, tyden_do: (r.tyden_do ?? r.tyden_od) + w } }
      }
      return {
        id: r.id,
        rec: { start: r.start ? iso(addDays(toD(r.start), d.delta)) : null, konec: r.konec ? iso(addDays(toD(r.konec), d.delta)) : null },
      }
    })
    // okamžitě v obrazovce, pak uložit
    setRows((rs) => rs.map((r) => { const u = updates.find((x) => x.id === r.id); return u ? { ...r, ...u.rec } : r }))
    const res = await Promise.all(updates.map((u) => supabase.from('harmonogram').update(u.rec).eq('id', u.id)))
    const bad = res.find((x) => x.error)
    if (bad) setErr('Uložení posunu selhalo: ' + bad.error.message + ' – obnov stránku.')
  }
  const sh = (verze, id, date) => (drag && drag.verze === verze && drag.ids.has(id) && date ? addDays(date, drag.delta) : date)

  const bar = (s, e, cls, title, verze, id) => {
    if (!s) return null
    s = sh(verze, id, s); e = sh(verze, id, e)
    const end = e || today
    const w = Math.max(0.4, pct(addDays(end, 1)) - pct(s))
    const movable = id && !(verze === 'ondra' && lockOndra)
    const moving = drag && drag.verze === verze && drag.ids.has(id)
    const tip = moving ? `${title} → posun ${drag.delta > 0 ? '+' : ''}${drag.verze === 'vzor' ? drag.delta / 7 + ' t' : drag.delta + ' d'}` : title
    return (
      <div
        className={'gbar ' + cls + (e ? '' : ' open') + (movable ? ' movable' : '') + (moving ? ' moving' : '')}
        style={{ left: pct(s) + '%', width: w + '%' }}
        title={tip}
        onPointerDown={(ev) => onDown(ev, verze, id)}
      />
    )
  }
  const rng = (s, e) => (s ? `${fmtDate(iso(s))} – ${e ? fmtDate(iso(e)) : 'probíhá'}` : 'bez termínu')

  const Grid = () => (
    <div className="ggrid">
      {months.map((m) => <div key={m.d.getTime()} className="gmonth" style={{ left: m.left + '%', width: m.width + '%' }} />)}
      <div className="gtoday" style={{ left: pct(today) + '%' }} title={'Dnes ' + fmtDate(iso(today))} />
    </div>
  )

  const konecVzor = gVzor.reduce((m, g) => (g.e && (!m || g.e > m) ? g.e : m), null)
  const konecOndra = gOndra.length ? gOndra[gOndra.length - 1].s : null

  return (
    <div className="page">
      <div className="page-head"><h1>Harmonogram</h1></div>

      <div className="toolbar">
        <label>Zahájení stavby (od něj se počítá vzor)
          <input type="date" value={zahajeniStr} onChange={(e) => saveZahajeni(e.target.value)} />
        </label>
        <label className="chk"><input type="checkbox" checked={show.ondra} onChange={(e) => setShow({ ...show, ondra: e.target.checked })} /> <span className="lg ondra" /> Ondra (v02)</label>
        <label className="chk"><input type="checkbox" checked={show.vzor} onChange={(e) => setShow({ ...show, vzor: e.target.checked })} /> <span className="lg vzor" /> Vzor</label>
        <label className="chk"><input type="checkbox" checked={show.realita} onChange={(e) => setShow({ ...show, realita: e.target.checked })} /> <span className="lg realita" /> Realita</label>
        <label className="chk"><input type="checkbox" checked={lockOndra} onChange={(e) => setLockOndra(e.target.checked)} /> 🔒 zamknout plán Ondry</label>
      </div>
      <p className="hint">Lištu chytni myší a posuň – stejně se posunou i všechny následující fáze téže verze. Vzor se posouvá po týdnech, realita a Ondra po dnech.</p>
      {err && <div className="error">{err}</div>}

      <div className="gantt">
        <div className="grow ghead">
          <div className="glabel" />
          <div className="gtrack">
            {months.map((m) => (
              <div key={m.d.getTime()} className="gmlabel" style={{ left: m.left + '%', width: m.width + '%' }}>
                {MESICE[m.d.getMonth()]}{m.d.getMonth() === 0 || m === months[0] ? ' ' + m.d.getFullYear() : ''}
              </div>
            ))}
          </div>
          <div className="gskluz">Skluz</div>
        </div>

        {show.ondra && (
          <>
            <div className="gsection">Plán Ondry (v02, 26. 5. 2026) – konce fází odvozené ze začátku další fáze</div>
            {gOndra.map((g, i) => (
              <div className="grow" key={'o' + i}>
                <div className="glabel" title={g.note || ''}>{g.label}</div>
                <div className="gtrack"><Grid />{bar(g.s, g.e, 'ondra', `${g.label}: ${rng(g.s, g.e)}`, 'ondra', g.id)}</div>
                <div className="gskluz" />
              </div>
            ))}
          </>
        )}

        {(show.vzor || show.realita) && (
          <>
            <div className="gsection">Vzor{show.realita ? ' a realita' : ''} – nahoře vzor, dole skutečnost</div>
            {gVzor.map((g, i) => (
              <div className="grow" key={'v' + i}>
                <div className="glabel" title={g.note || ''}>{g.label}</div>
                <div className="gtrack">
                  <Grid />
                  {show.vzor && bar(g.s, g.e, 'vzor top', `Vzor – ${g.label}: ${rng(g.s, g.e)}`, 'vzor', g.vid)}
                  {show.realita && bar(g.rs, g.re, 'realita bottom', `Realita – ${g.label}: ${rng(g.rs, g.re)}`, 'realita', g.rid)}
                </div>
                <div className={'gskluz ' + (g.skluz > 0 ? 'neg' : g.skluz < 0 ? 'pos' : '')}>
                  {g.skluz === null ? '' : g.skluz === 0 ? 'včas' : (g.skluz > 0 ? '+' : '') + g.skluz + ' d'}
                </div>
              </div>
            ))}
            {show.realita && extraReal.map((g, i) => (
              <div className="grow" key={'r' + i}>
                <div className="glabel">{g.label}</div>
                <div className="gtrack"><Grid />{bar(g.rs, g.re, 'realita', `Realita – ${g.label}: ${rng(g.rs, g.re)}`, 'realita', g.rid)}</div>
                <div className="gskluz" />
              </div>
            ))}
          </>
        )}
      </div>

      <p className="muted small">
        Vzor: {zahajeni ? `zahájení ${fmtDate(zahajeniStr)}, dokončení ${konecVzor ? fmtDate(iso(konecVzor)) : '—'}` : 'nastav datum zahájení'}
        {konecOndra && <> · Ondra: prodej od {fmtDate(iso(konecOndra))}</>}
        {' · '}Svislá červená čára = dnes. Skluz = o kolik dní později realita začala, nebo skončila, oproti vzoru.
      </p>

      <h2 style={{ marginTop: 24 }}>Data harmonogramu</h2>
      <p className="muted small">
        Realitu zapisuj k řádkům „Realita“ – vyplň Začátek, a až fáze skončí, i Konec. Vzor se řídí týdny od data zahájení.
      </p>
      <DataTable
        title=""
        table="harmonogram"
        cols={HARM_COLS}
        rows={rows}
        setRows={setRows}
        defaultSort={[{ key: 'verze', dir: 'asc' }, { key: 'poradi', dir: 'asc' }]}
      />
    </div>
  )
}
