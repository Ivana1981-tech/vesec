import { useState } from 'react'
import { money0 } from './format'

const sum = (arr) => arr.reduce((s, r) => s + Number(r.castka || 0), 0)

export default function Prehled({ vydaje, jz }) {
  const v = vydaje.filter((r) => !r.smazat)
  const j = jz.filter((r) => !r.smazat)

  const celkem = sum(v)
  const oficialne = sum(v.filter((r) => r.rezim === 'oficialne'))
  const bokem = sum(v.filter((r) => r.rezim === 'bokem'))
  const nezaplaceno = sum(v.filter((r) => !r.zaplaceno))

  const kategorie = {}
  for (const r of v) {
    const k = r.kategorie || '(bez kategorie)'
    kategorie[k] = (kategorie[k] || 0) + Number(r.castka || 0)
  }
  const kat = Object.entries(kategorie).sort((a, b) => b[1] - a[1])
  const maxKat = Math.max(1, ...kat.map((k) => k[1]))

  // Vyrovnání s Jitkou: financuje 50 % odlivů
  const odJitky = sum(j.filter((r) => r.smer === 'prijem'))
  const jitce = sum(j.filter((r) => r.smer === 'vydej'))
  const jitkaCisty = odJitky - jitce
  const jitkaPodil = celkem / 2
  const rozdil = jitkaCisty - jitkaPodil // + = Jitka má přeplaceno

  // Scénář prodeje
  const [cena, setCena] = useState('')
  const [pctOndra, setPctOndra] = useState('35')
  const cenaN = Number(String(cena).replace(/\s/g, '').replace(',', '.')) || 0
  const vysledek = cenaN - celkem
  const po = Math.min(100, Math.max(0, Number(String(pctOndra).replace(',', '.')) || 0))
  const ondra = vysledek > 0 ? (vysledek * po) / 100 : 0
  const zbytek = vysledek - ondra
  const iva = zbytek / 2
  const jitka = zbytek / 2

  return (
    <div className="page">
      <div className="page-head"><h1>Přehled</h1></div>

      <div className="cards">
        <div className="card"><div className="lbl">Odlivy celkem</div><div className="val">{money0(celkem)}</div></div>
        <div className="card"><div className="lbl">Oficiálně</div><div className="val">{money0(oficialne)}</div></div>
        <div className="card"><div className="lbl">Bokem</div><div className="val">{money0(bokem)}</div></div>
        <div className="card"><div className="lbl">Nezaplaceno</div><div className="val">{money0(nezaplaceno)}</div></div>
      </div>

      <div className="grid2">
        <section className="box">
          <h2>Odlivy podle kategorie</h2>
          {kat.length === 0 && <p className="muted">Zatím žádné výdaje.</p>}
          {kat.map(([k, s]) => (
            <div className="bar" key={k}>
              <span className="bar-lbl">{k}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(s / maxKat) * 100}%` }} /></span>
              <span className="bar-val">{money0(s)}</span>
            </div>
          ))}
        </section>

        <section className="box">
          <h2>Vyrovnání s Jitkou</h2>
          <table className="kv">
            <tbody>
              <tr><td>Jitka poslala Ivě</td><td className="num">{money0(odJitky)}</td></tr>
              <tr><td>Iva vrátila Jitce</td><td className="num">{money0(jitce)}</td></tr>
              <tr className="strong"><td>Jitka vložila čistě</td><td className="num">{money0(jitkaCisty)}</td></tr>
              <tr><td>Její polovina zapsaných odlivů</td><td className="num">{money0(jitkaPodil)}</td></tr>
              <tr className="strong">
                <td>{rozdil >= 0 ? 'Jitka má přeplaceno (Iva dluží)' : 'Jitka má doplatit'}</td>
                <td className={'num ' + (rozdil >= 0 ? 'pos' : 'neg')}>{money0(Math.abs(rozdil))}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">Počítá se ze všech zapsaných odlivů (oficiálně i bokem, vč. pozemku), bez záznamů označených ke smazání.</p>
        </section>
      </div>

      <section className="box">
        <h2>Scénář prodeje</h2>
        <div className="toolbar">
          <label>Předpokládaná prodejní cena (Kč)
            <input className="num" value={cena} onChange={(e) => setCena(e.target.value)} placeholder="např. 13 000 000" />
          </label>
          <label>Podíl Ondry na zisku (%)
            <input className="num short" value={pctOndra} onChange={(e) => setPctOndra(e.target.value)} />
          </label>
        </div>
        {cenaN > 0 && (
          <table className="kv">
            <tbody>
              <tr><td>Prodejní cena</td><td className="num">{money0(cenaN)}</td></tr>
              <tr><td>Odlivy zapsané k dnešku</td><td className="num">− {money0(celkem)}</td></tr>
              <tr className="strong"><td>{vysledek >= 0 ? 'Zisk' : 'Ztráta'}</td><td className={'num ' + (vysledek >= 0 ? 'pos' : 'neg')}>{money0(vysledek)}</td></tr>
              <tr><td>Ondra ({vysledek > 0 ? po : 0} % ze zisku)</td><td className="num">{money0(ondra)}</td></tr>
              <tr><td>Iva (polovina zbytku)</td><td className="num">{money0(iva)}</td></tr>
              <tr><td>Jitka (polovina zbytku)</td><td className="num">{money0(jitka)}</td></tr>
            </tbody>
          </table>
        )}
        <p className="muted small">
          Orientační výpočet: zatím se počítá jen s odlivy zapsanými k dnešku a bez nákladů prodeje. Podíl Ondry si ověř ve smlouvě.
          Při ztrátě Ondra nedostává nic navíc a ztrátu nesou Iva a Jitka napůl.
        </p>
      </section>
    </div>
  )
}
