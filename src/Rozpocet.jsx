import DataTable from './DataTable'
import { money0 } from './format'

export const ROZP_COLS = [
  {
    key: 'verze', label: 'Verze', type: 'select', default: 'propocet',
    options: [
      { value: 'ondra', label: 'Ondra (v02)' },
      { value: 'propocet', label: 'Propočet' },
    ],
  },
  { key: 'poradi', label: 'Pořadí', type: 'int', required: true },
  { key: 'skupina', label: 'Skupina', type: 'text' },
  { key: 'polozka', label: 'Položka', type: 'text', required: true, wide: true },
  { key: 'castka', label: 'Částka', type: 'money', required: true },
  { key: 'dph_sazba', label: 'DPH %', type: 'int', default: 12 },
  { key: 'poznamka', label: 'Poznámka', type: 'text', wide: true },
]

const sum = (rows, f = () => true) => rows.filter(f).reduce((s, r) => s + Number(r.castka || 0), 0)
const sumDph = (rows) => rows.reduce((s, r) => s + Number(r.castka || 0) * (1 + Number(r.dph_sazba || 0) / 100), 0)

export default function Rozpocet({ rows, setRows, vydaje }) {
  const live = rows.filter((r) => !r.smazat)
  const v = (k) => live.filter((r) => r.verze === k)
  const card = (k, label) => {
    const r = v(k)
    return (
      <div className="card">
        <div className="lbl">{label}</div>
        <div className="val">{money0(sumDph(r))}</div>
        <div className="small muted">
          stavba {money0(sum(r, (x) => x.skupina === 'Stavba'))} bez DPH · ostatní {money0(sum(r, (x) => x.skupina !== 'Stavba'))}
        </div>
      </div>
    )
  }
  const odlivy = sum(vydaje.filter((x) => !x.smazat))
  const ondraCelkem = sumDph(v('ondra'))

  return (
    <div className="page">
      <div className="page-head"><h1>Rozpočet</h1></div>
      <div className="cards">
        {card('ondra', 'Ondra v02 (26. 5. 2026) – celkem vč. DPH')}
        {card('propocet', 'Propočet podle ukazatelů RTS 2026 – celkem vč. DPH')}
        <div className="card">
          <div className="lbl">Zatím zapsané odlivy</div>
          <div className="val">{money0(odlivy)}</div>
          <div className="small muted">{ondraCelkem ? Math.round((odlivy / ondraCelkem) * 100) : 0} % Ondrova rozpočtu</div>
        </div>
      </div>
      <p className="muted small">
        Propočet = orientační cena podle cenových ukazatelů RTS 2026 (JKSO 803.6 rodinné domy, nosná konstrukce dřevěná,
        9 920 Kč/m³ obestavěného prostoru bez DPH). Obestavěný prostor je zatím jen odhad – přesné číslo spočítám z výkresů.
        Ostatní položky jsou převzaté z Ondrova rozpočtu.
      </p>
      <DataTable
        title=""
        table="rozpocet"
        cols={ROZP_COLS}
        rows={rows}
        setRows={setRows}
        defaultSort={[{ key: 'verze', dir: 'asc' }, { key: 'poradi', dir: 'asc' }]}
      />
    </div>
  )
}
