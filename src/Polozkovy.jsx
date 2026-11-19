import { useMemo, useState } from 'react'
import DataTable from './DataTable'
import { money0 } from './format'

export const VYKAZ_COLS = [
  { key: 'poradi', label: 'Č.', type: 'int', required: true },
  { key: 'dil', label: 'Díl', type: 'text', required: true },
  { key: 'kod', label: 'Kód RTS', type: 'text' },
  { key: 'popis', label: 'Popis položky', type: 'text', required: true, wide: true },
  { key: 'mj', label: 'MJ', type: 'text' },
  { key: 'mnozstvi', label: 'Množství', type: 'money' },
  { key: 'cena_jedn', label: 'Jedn. cena', type: 'money' },
  { key: 'castka', label: 'Celkem bez DPH', type: 'money', readonly: true },
  { key: 'dph_sazba', label: 'DPH %', type: 'int', default: 12 },
  { key: 'varianta', label: 'Varianta', type: 'text' },
  { key: 'balicek', label: 'Poptávkový balíček', type: 'text' },
  { key: 'vypocet', label: 'Výpočet výměry', type: 'text', wide: true },
  { key: 'poznamka', label: 'Poznámka', type: 'text', wide: true },
]

// Varianty, které se navzájem vylučují; prázdná varianta = vždy
const SKUPINY = { konstrukce: ['zděná', 'CLT'], okna: ['plast', 'hliník'], volitelne: ['volitelné'] }

export default function Polozkovy({ rows, setRows }) {
  const [konstrukce, setKonstrukce] = useState('zděná')
  const [okna, setOkna] = useState('plast')
  const [volitelne, setVolitelne] = useState(true)

  const withTotals = useMemo(
    () => rows.map((r) => ({ ...r, castka: r.mnozstvi != null && r.cena_jedn != null ? Number(r.mnozstvi) * Number(r.cena_jedn) : null })),
    [rows]
  )

  const zahrnuto = (r) => {
    if (r.smazat) return false
    const v = r.varianta || ''
    if (!v) return true
    if (SKUPINY.konstrukce.includes(v)) return v === konstrukce
    if (SKUPINY.okna.includes(v)) return v === okna
    if (SKUPINY.volitelne.includes(v)) return volitelne
    return true
  }
  const vybrane = withTotals.filter(zahrnuto)
  const bez = vybrane.reduce((s, r) => s + (r.castka || 0), 0)
  const s = vybrane.reduce((s, r) => s + (r.castka || 0) * (1 + Number(r.dph_sazba || 0) / 100), 0)
  const oceneno = vybrane.filter((r) => r.cena_jedn != null).length

  return (
    <div className="page">
      <div className="page-head"><h1>Položkový rozpočet</h1></div>

      <div className="toolbar">
        <label>Nosná konstrukce
          <select value={konstrukce} onChange={(e) => setKonstrukce(e.target.value)}>
            <option value="zděná">zděná (podle studie)</option>
            <option value="CLT">CLT (podle Ondry)</option>
          </select>
        </label>
        <label>Okna
          <select value={okna} onChange={(e) => setOkna(e.target.value)}>
            <option value="plast">plastová</option>
            <option value="hliník">hliníková</option>
          </select>
        </label>
        <label className="chk"><input type="checkbox" checked={volitelne} onChange={(e) => setVolitelne(e.target.checked)} /> včetně volitelných (rekuperace)</label>
      </div>

      <div className="cards">
        <div className="card"><div className="lbl">Vybraná varianta – bez DPH</div><div className="val">{money0(bez)}</div></div>
        <div className="card"><div className="lbl">Vybraná varianta – vč. DPH</div><div className="val">{money0(s)}</div></div>
        <div className="card"><div className="lbl">Oceněno položek</div><div className="val">{oceneno} / {vybrane.length}</div></div>
      </div>

      <p className="muted small">
        Výkaz výměr podle studie (půdorysy 1:50, řez, pohledy 1:100). Kde je ve sloupci „Výpočet výměry“ uvedeno „odhad“, výměra se
        z výkresu nedala přesně odměřit – upřesní se z prováděcí dokumentace. Ceny doplňuj kliknutím do „Jedn. cena“ (a kód RTS),
        Celkem se dopočítá samo. Tabulka níže ukazuje všechny varianty; součty nahoře jen vybranou. Seskupení podle „Díl“ ukáže mezisoučty.
      </p>

      <DataTable
        title=""
        table="vykaz"
        cols={VYKAZ_COLS}
        rows={withTotals}
        setRows={setRows}
        defaultSort={[{ key: 'poradi', dir: 'asc' }]}
        rowClass={(r) => (zahrnuto(r) ? '' : 'muted-row')}
      />
    </div>
  )
}
