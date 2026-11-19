import { useMemo, useState } from 'react'
import DataTable from './DataTable'
import { money0 } from './format'

const STAVY = [
  { value: 'pripravit', label: 'připravit' },
  { value: 'odeslano', label: 'odesláno' },
  { value: 'nabidka', label: 'nabídka přišla' },
  { value: 'vybrano', label: 'vybráno' },
  { value: 'zamitnuto', label: 'zamítnuto' },
]

const fmtQ = (n) => (n == null ? '' : new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(Number(n)))

export default function Poptavky({ vykaz, rows, setRows }) {
  const balicky = useMemo(() => {
    const m = new Map()
    for (const v of vykaz.filter((x) => !x.smazat && x.balicek)) {
      if (!m.has(v.balicek)) m.set(v.balicek, [])
      m.get(v.balicek).push(v)
    }
    return [...m.entries()].map(([nazev, polozky]) => ({ nazev, polozky: polozky.sort((a, b) => a.poradi - b.poradi) }))
  }, [vykaz])
  const [sel, setSel] = useState(null)
  const cur = balicky.find((b) => b.nazev === sel) || balicky[0]
  const [copied, setCopied] = useState(false)

  const text = cur
    ? [
        `Poptávka: ${cur.nazev} – RD Vesec (k. ú. Vesec u Liberce)`,
        '',
        'Dobrý den,',
        `prosím o cenovou nabídku na níže uvedené práce a dodávky pro novostavbu nepodsklepeného rodinného domu (zastavěná plocha cca 105 m², 1.NP + podkroví, sedlová střecha). Výměry vycházejí ze studie a mohou se upřesnit podle prováděcí dokumentace.`,
        '',
        ...cur.polozky.map((p, i) =>
          `${i + 1}. ${p.popis}${p.varianta ? ` [varianta: ${p.varianta}]` : ''} – ${fmtQ(p.mnozstvi) || 'dle PD'} ${p.mj || ''}`.trim()
        ),
        '',
        'Prosím o nabídku v členění po položkách (jednotková cena bez DPH), s uvedením termínu možného zahájení, doby provádění a platnosti nabídky.',
        '',
        'Děkuji,',
        'Ivana Kloučková',
      ].join('\n')
    : ''

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  const cols = [
    { key: 'balicek', label: 'Balíček', type: 'text', required: true, default: cur?.nazev || '' },
    { key: 'dodavatel', label: 'Dodavatel', type: 'text', wide: true },
    { key: 'kontakt', label: 'Kontakt', type: 'text' },
    { key: 'stav', label: 'Stav', type: 'select', default: 'pripravit', options: STAVY },
    { key: 'odeslano', label: 'Odesláno', type: 'date' },
    { key: 'termin', label: 'Nabídka do', type: 'date' },
    { key: 'cena', label: 'Cena bez DPH', type: 'money' },
    { key: 'odkaz', label: 'Nabídka (odkaz)', type: 'text', link: true },
    { key: 'poznamka', label: 'Poznámka', type: 'text', wide: true },
  ]
  const shown = rows.filter((r) => !cur || r.balicek === cur.nazev)

  const stavy = (b) => rows.filter((r) => !r.smazat && r.balicek === b)

  return (
    <div className="page">
      <div className="page-head"><h1>Poptávky</h1></div>
      <div className="contracts">
        <div className="clist">
          {balicky.map((b) => {
            const p = stavy(b.nazev)
            const vybrano = p.find((x) => x.stav === 'vybrano')
            return (
              <button key={b.nazev} className={b.nazev === cur?.nazev ? 'active' : ''} onClick={() => setSel(b.nazev)}>
                <div className="cname">{b.nazev}</div>
                <div className="small muted">
                  {b.polozky.length} položek · {p.length} poptávek
                  {vybrano ? ` · vybráno: ${vybrano.dodavatel || '?'}` : ''}
                </div>
              </button>
            )
          })}
        </div>
        {cur && (
          <div className="cedit">
            <h2 style={{ margin: 0 }}>{cur.nazev}</h2>
            <div className="cactions">
              <button className="primary" onClick={copy}>{copied ? 'Zkopírováno ✓' : 'Kopírovat text poptávky'}</button>
              <a className="small" href={`mailto:?subject=${encodeURIComponent('Poptávka: ' + cur.nazev + ' – RD Vesec')}&body=${encodeURIComponent(text)}`}>otevřít v e-mailu</a>
            </div>
            <pre className="ptext">{text}</pre>
            <h2 style={{ margin: '8px 0 0' }}>Oslovení dodavatelé a nabídky</h2>
            <p className="muted small">Ke každému dodavateli jeden řádek. Nejlevnější vybranou nabídku pak přeneseme do položkového rozpočtu.</p>
            {(() => {
              const nab = shown.filter((r) => !r.smazat && r.cena != null)
              const min = nab.length ? Math.min(...nab.map((r) => Number(r.cena))) : null
              return min != null ? <p className="small">Nejnižší nabídka: <b>{money0(min)}</b> bez DPH</p> : null
            })()}
            <DataTable
              title=""
              table="poptavky"
              cols={cols}
              rows={shown}
              setRows={setRows}
              defaultSort={[{ key: 'stav', dir: 'asc' }]}
            />
          </div>
        )}
      </div>
    </div>
  )
}
