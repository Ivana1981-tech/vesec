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
  const [cascade, setCascade] = useState(true)
  const [edit, setEdit] = useState(null)
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

  // ---------- posouvání a změna délky lišt ----------
  // „Následující“ = fáze stejné verze, které začínají ve stejný den nebo později (bez fáze samotné).
  function followers(verze, me) {
    const same = live.filter((r) => r.verze === verze && r.id !== me.id)
    if (verze === 'vzor') return same.filter((r) => r.tyden_od != null && r.tyden_od >= me.tyden_od).map((r) => r.id)
    return same.filter((r) => r.start && me.start && r.start >= me.start).map((r) => r.id)
  }
  const rowById = (id) => live.find((r) => r.id === id)

  function onDown(e, verze, id, mode) {
    if (!id || (verze === 'ondra' && lockOndra)) return
    e.preventDefault(); e.stopPropagation()
    const me = rowById(id)
    if (mode === 'resize' && verze !== 'vzor' && !me.konec) return
    const trackW = e.currentTarget.closest('.gtrack').getBoundingClientRect().width
    const d = { verze, id, mode, follow: cascade ? new Set(followers(verze, me)) : new Set(), x0: e.clientX, trackW, delta: 0, moved: false }
    dragRef.current = d
    setDrag(d)
  }
  useEffect(() => {
    if (!drag) return
    const move = (e) => {
      const d = dragRef.current
      if (Math.abs(e.clientX - d.x0) > 3) d.moved = true
      let days = Math.round(((e.clientX - d.x0) / d.trackW) * span)
      const me = rowById(d.id)
      if (d.verze === 'vzor') {
        let w = Math.round(days / 7)
        if (d.mode === 'move') {
          const minOd = Math.min(me.tyden_od, ...live.filter((r) => d.follow.has(r.id)).map((r) => r.tyden_od))
          if (minOd + w < 1) w = 1 - minOd
        } else {
          const len = (me.tyden_do ?? me.tyden_od) - me.tyden_od
          if (len + w < 0) w = -len
        }
        days = w * 7
      } else if (d.mode === 'resize') {
        const len = Math.round((toD(me.konec) - toD(me.start)) / DAY)
        if (len + days < 0) days = -len
      }
      if (days !== d.delta) { d.delta = days; setDrag({ ...d }) }
    }
    const up = async () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      if (!d.moved) { openEditor(d.verze, d.id); return }
      if (!d.delta) return
      await applyChange(d.verze, d.id, d.mode === 'move' ? d.delta : 0, d.delta, d.follow)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [drag?.id, drag?.verze, drag?.mode])

  // dStart/dEnd ve dnech (u vzoru násobky 7); následující fáze se posunou o dEnd
  async function applyChange(verze, id, dStart, dEnd, follow) {
    setErr('')
    const updates = []
    const shiftRec = (r, ds, de) => {
      if (verze === 'vzor') return { tyden_od: r.tyden_od + ds / 7, tyden_do: (r.tyden_do ?? r.tyden_od) + de / 7 }
      return {
        start: r.start ? iso(addDays(toD(r.start), ds)) : null,
        konec: r.konec ? iso(addDays(toD(r.konec), de)) : null,
      }
    }
    const me = rowById(id)
    updates.push({ id, rec: shiftRec(me, dStart, dEnd) })
    if (dEnd) for (const r of live.filter((r) => follow.has(r.id))) updates.push({ id: r.id, rec: shiftRec(r, dEnd, dEnd) })
    setRows((rs) => rs.map((r) => { const u = updates.find((x) => x.id === r.id); return u ? { ...r, ...u.rec } : r }))
    const res = await Promise.all(updates.map((u) => supabase.from('harmonogram').update(u.rec).eq('id', u.id)))
    const bad = res.find((x) => x.error)
    if (bad) setErr('Uložení selhalo: ' + bad.error.message + ' – obnov stránku.')
  }

  // Náhled během tažení
  const sh = (verze, id, date, isEnd) => {
    if (!drag || drag.verze !== verze || !date) return date
    if (id === drag.id) return drag.mode === 'move' || isEnd ? addDays(date, drag.delta) : date
    return drag.follow.has(id) ? addDays(date, drag.delta) : date
  }

  // ---------- editor fáze po kliknutí ----------
  function openEditor(verze, id) {
    if (verze === 'ondra' && lockOndra) return
    const r = rowById(id)
    setEdit({ verze, id, faze: r.faze, start: r.start || '', konec: r.konec || '', tyden_od: r.tyden_od ?? '', tyden_do: r.tyden_do ?? '' })
  }
  async function saveEditor() {
    const r = rowById(edit.id)
    if (edit.verze === 'vzor') {
      const od = parseInt(edit.tyden_od, 10), dd = parseInt(edit.tyden_do, 10)
      if (!(od >= 1) || !(dd >= od)) { setErr('Týden do musí být ≥ týden od a týden od ≥ 1'); return }
      const ds = (od - r.tyden_od) * 7, de = (dd - (r.tyden_do ?? r.tyden_od)) * 7
      const follow = cascade ? new Set(followers('vzor', r)) : new Set()
      await applyChange('vzor', r.id, ds, de, follow)
    } else {
      if (!edit.start) { setErr('Začátek je povinný'); return }
      if (edit.konec && edit.konec < edit.start) { setErr('Konec nesmí být před začátkem'); return }
      const ds = r.start ? Math.round((toD(edit.start) - toD(r.start)) / DAY) : 0
      const de = r.konec && edit.konec ? Math.round((toD(edit.konec) - toD(r.konec)) / DAY) : 0
      const follow = cascade && r.start ? new Set(followers(edit.verze, r)) : new Set()
      // nejdřív samotná fáze přesně podle zadání, pak následující o změnu konce
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, start: edit.start, konec: edit.konec || null } : x)))
      const { error } = await supabase.from('harmonogram').update({ start: edit.start, konec: edit.konec || null }).eq('id', r.id)
      if (error) { setErr('Uložení selhalo: ' + error.message); return }
      if (de && follow.size) {
        const ups = live.filter((x) => follow.has(x.id)).map((x) => ({
          id: x.id,
          rec: { start: x.start ? iso(addDays(toD(x.start), de)) : null, konec: x.konec ? iso(addDays(toD(x.konec), de)) : null },
        }))
        setRows((rs) => rs.map((x) => { const u = ups.find((y) => y.id === x.id); return u ? { ...x, ...u.rec } : x }))
        await Promise.all(ups.map((u) => supabase.from('harmonogram').update(u.rec).eq('id', u.id)))
      }
      void ds
    }
    setEdit(null)
  }

  const bar = (s, e, cls, title, verze, id) => {
    if (!s) return null
    const s2 = sh(verze, id, s, false), e2 = sh(verze, id, e, true)
    const end = e2 || today
    const w = Math.max(0.4, pct(addDays(end, 1)) - pct(s2))
    const movable = id && !(verze === 'ondra' && lockOndra)
    const active = drag && drag.verze === verze && (drag.id === id || drag.follow.has(id))
    let tip = title + (movable ? ' · klik = upravit, táhni = posunout, pravý okraj = délka' : '')
    if (active && drag.id === id) {
      const u = drag.verze === 'vzor' ? `${drag.delta / 7} t` : `${drag.delta} d`
      tip = `${drag.mode === 'move' ? 'posun' : 'délka'} ${drag.delta > 0 ? '+' : ''}${u}`
    }
    return (
      <div
        className={'gbar ' + cls + (e ? '' : ' open') + (movable ? ' movable' : '') + (active ? ' moving' : '')}
        style={{ left: pct(s2) + '%', width: w + '%' }}
        title={tip}
        onPointerDown={(ev) => onDown(ev, verze, id, 'move')}
      >
        {movable && (verze === 'vzor' || e) && (
          <span className="ghandle" onPointerDown={(ev) => onDown(ev, verze, id, 'resize')} />
        )}
      </div>
    )
  }

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
        <label className="chk"><input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} /> posouvat i následující fáze</label>
      </div>
      <p className="hint">
        Klik na lištu = upravit termíny · táhnutí lišty = posun · táhnutí pravého okraje = změna délky. Následující fáze téže verze se posunou o stejnou dobu.
        Vzor po týdnech, realita a Ondra po dnech.
      </p>
      {edit && (
        <div className="gedit">
          <b>{edit.faze}</b> <span className="muted small">({edit.verze === 'vzor' ? 'vzor' : edit.verze === 'ondra' ? 'Ondra' : 'realita'})</span>
          {edit.verze === 'vzor' ? (
            <>
              <label>Týden od<input className="short num" value={edit.tyden_od} onChange={(e) => setEdit({ ...edit, tyden_od: e.target.value })} /></label>
              <label>Týden do<input className="short num" value={edit.tyden_do} onChange={(e) => setEdit({ ...edit, tyden_do: e.target.value })} /></label>
              <span className="small muted">délka {Math.max(0, (parseInt(edit.tyden_do, 10) || 0) - (parseInt(edit.tyden_od, 10) || 0) + 1)} t</span>
            </>
          ) : (
            <>
              <label>Začátek<input type="date" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></label>
              <label>Konec<input type="date" value={edit.konec} onChange={(e) => setEdit({ ...edit, konec: e.target.value })} /></label>
              {edit.start && edit.konec && <span className="small muted">délka {Math.round((toD(edit.konec) - toD(edit.start)) / DAY) + 1} d</span>}
            </>
          )}
          <button className="primary" onClick={saveEditor}>Uložit</button>
          <button onClick={() => setEdit(null)}>Zrušit</button>
        </div>
      )}
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
