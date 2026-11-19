import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { date as fmtDate } from './format'

const STAVY = [
  { value: 'navrh', label: 'návrh' },
  { value: 'k_podpisu', label: 'k podpisu' },
  { value: 'podepsana', label: 'podepsaná' },
  { value: 'zrusena', label: 'zrušená' },
]
const stavLabel = (v) => STAVY.find((s) => s.value === v)?.label || v
const dt = (ts) => (ts ? new Date(ts).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }) : '')

export default function Smlouvy({ rows, setRows }) {
  const live = rows.filter((r) => !r.smazat).sort((a, b) => a.id - b.id)
  const [selId, setSelId] = useState(live[0]?.id ?? null)
  const sel = rows.find((r) => r.id === selId) || null
  const [draft, setDraft] = useState(null)
  const [hist, setHist] = useState([])
  const [showHist, setShowHist] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => { setDraft(sel ? { ...sel } : null) }, [selId, sel?.upraveno])
  useEffect(() => { setShowHist(false); setSaved('') }, [selId])

  const dirty = draft && sel && ['nazev', 'strana', 'stav', 'datum_podpisu', 'text', 'odkaz', 'poznamka'].some((k) => (draft[k] ?? '') !== (sel[k] ?? ''))

  // Varování při odchodu s neuloženými změnami
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  async function save() {
    setErr(''); setSaved('')
    if (!draft.nazev?.trim()) { setErr('Název je povinný'); return }
    const rec = {
      nazev: draft.nazev, strana: draft.strana || null, stav: draft.stav,
      datum_podpisu: draft.datum_podpisu || null, text: draft.text ?? '',
      odkaz: draft.odkaz || null, poznamka: draft.poznamka || null,
    }
    const { data, error } = await supabase.from('smlouvy').update(rec).eq('id', sel.id).select().single()
    if (error) { setErr('Uložení selhalo: ' + error.message); return }
    setRows((rs) => rs.map((r) => (r.id === data.id ? data : r)))
    setSaved('Uloženo ' + dt(data.upraveno))
  }

  async function add() {
    setErr('')
    const { data, error } = await supabase.from('smlouvy').insert({ nazev: 'Nová smlouva' }).select().single()
    if (error) { setErr('Uložení selhalo: ' + error.message); return }
    setRows((rs) => [...rs, data]); setSelId(data.id)
  }

  async function loadHist() {
    const { data, error } = await supabase.from('smlouvy_historie').select('*').eq('smlouva_id', sel.id).order('ulozeno', { ascending: false })
    if (error) { setErr(error.message); return }
    setHist(data); setShowHist(true)
  }

  function pick(id) {
    if (dirty && !confirm('Máš neuložené změny. Opravdu přejít jinam?')) return
    setSelId(id)
  }

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))

  return (
    <div className="page">
      <div className="page-head">
        <h1>Smlouvy</h1>
        <button onClick={add}>+ Nová smlouva</button>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="contracts">
        <div className="clist">
          {live.map((r) => (
            <button key={r.id} className={r.id === selId ? 'active' : ''} onClick={() => pick(r.id)}>
              <div className="cname">{r.nazev}</div>
              <div className="small muted">{stavLabel(r.stav)}{r.datum_podpisu ? ' · ' + fmtDate(r.datum_podpisu) : ''}</div>
            </button>
          ))}
        </div>

        {draft ? (
          <div className="cedit">
            <div className="cmeta">
              <label className="wide">Název<input value={draft.nazev ?? ''} onChange={set('nazev')} /></label>
              <label>Druhá strana<input value={draft.strana ?? ''} onChange={set('strana')} /></label>
              <label>Stav
                <select value={draft.stav} onChange={set('stav')}>
                  {STAVY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label>Datum podpisu<input type="date" value={draft.datum_podpisu ?? ''} onChange={set('datum_podpisu')} /></label>
              <label className="wide">Odkaz na podepsanou verzi (Dropbox)
                <span className="linkrow">
                  <input value={draft.odkaz ?? ''} onChange={set('odkaz')} placeholder="https://www.dropbox.com/…" />
                  {draft.odkaz && <a href={draft.odkaz} target="_blank" rel="noreferrer">otevřít</a>}
                </span>
              </label>
              <label className="full">Poznámka / co ještě vyřešit<input value={draft.poznamka ?? ''} onChange={set('poznamka')} /></label>
            </div>

            <textarea className="ctext" value={draft.text ?? ''} onChange={set('text')}
              placeholder="Text smlouvy. Sem ho nahraju já, nebo ho můžeš vložit či psát sama." />

            <div className="cactions">
              <button className="primary" onClick={save} disabled={!dirty}>Uložit</button>
              {dirty && <span className="small neg">neuložené změny</span>}
              {saved && !dirty && <span className="small muted">{saved}</span>}
              <span className="small muted">Naposledy upraveno {dt(sel.upraveno)}</span>
              <button onClick={() => (showHist ? setShowHist(false) : loadHist())}>{showHist ? 'Skrýt historii' : 'Historie verzí'}</button>
            </div>

            {showHist && (
              <div className="chist">
                {hist.length === 0 && <p className="muted small">Zatím žádné předchozí verze. Každé uložení změněného textu sem uloží předchozí znění.</p>}
                {hist.map((h) => (
                  <details key={h.id}>
                    <summary>{dt(h.ulozeno)} · {stavLabel(h.stav)} · {h.text.length} znaků</summary>
                    <pre>{h.text || '(prázdné)'}</pre>
                    <button onClick={() => setDraft((d) => ({ ...d, text: h.text }))}>Vrátit toto znění do editoru</button>
                  </details>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="muted">Vyber smlouvu vlevo.</p>
        )}
      </div>
    </div>
  )
}
