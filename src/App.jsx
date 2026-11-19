import { useEffect, useState } from 'react'
import { supabase, configOk } from './supabase'
import DataTable from './DataTable'
import Prehled from './Prehled'
import Harmonogram from './Harmonogram'
import { VYDAJE_COLS, JZ_COLS, UKOLY_COLS } from './columns'

const MENU = [
  { id: 'prehled', label: 'Přehled' },
  { id: 'vydaje', label: 'Výdaje' },
  { id: 'jitka', label: 'Jitka' },
  { id: 'rozpocet', label: 'Rozpočet', soon: true },
  { id: 'harmonogram', label: 'Harmonogram' },
  { id: 'ukoly', label: 'Úkoly' },
]

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr('Přihlášení se nepovedlo. Zkontroluj e-mail a heslo.')
    setBusy(false)
  }
  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>Vesec</h1>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Heslo<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="error">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Přihlašuji…' : 'Přihlásit'}</button>
      </form>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [page, setPage] = useState(() => location.hash.slice(1) || 'prehled')
  const [vydaje, setVydaje] = useState([])
  const [jz, setJz] = useState([])
  const [ukoly, setUkoly] = useState([])
  const [harm, setHarm] = useState([])
  const [nastaveni, setNastaveni] = useState([])
  const [loadErr, setLoadErr] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!configOk) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    ;(async () => {
      setLoadErr('')
      const [a, b, c, d, n] = await Promise.all([
        supabase.from('vydaje').select('*'),
        supabase.from('pohyby_jz').select('*'),
        supabase.from('ukoly').select('*'),
        supabase.from('harmonogram').select('*'),
        supabase.from('nastaveni').select('*'),
      ])
      const e = a.error || b.error || c.error || d.error || n.error
      if (e) setLoadErr('Data se nepodařilo načíst: ' + e.message)
      setVydaje(a.data || [])
      setJz(b.data || [])
      setUkoly(c.data || [])
      setHarm(d.data || [])
      setNastaveni(n.data || [])
    })()
  }, [session])

  useEffect(() => { location.hash = page; setMenuOpen(false) }, [page])

  if (!configOk) return <div className="login"><div className="error">Chybí nastavení VITE_SUPABASE_URL a VITE_SUPABASE_PUBLISHABLE_KEY ve Vercelu.</div></div>
  if (session === undefined) return null
  if (!session) return <Login />

  const current = MENU.find((m) => m.id === page) || MENU[0]
  const today = new Date().toISOString().slice(0, 10)
  const poLhute = ukoly.filter((u) => !u.smazat && u.stav !== 'hotovo' && u.termin && u.termin < today).length

  // Při přepnutí na „hotovo“ doplnit datum dokončení
  async function ukolSaved(row, key) {
    if (key === 'stav' && row.stav === 'hotovo' && !row.hotovo_dne) {
      const { data } = await supabase.from('ukoly').update({ hotovo_dne: today }).eq('id', row.id).select().single()
      if (data) setUkoly((us) => us.map((u) => (u.id === data.id ? data : u)))
    }
  }

  return (
    <div className="app">
      <aside className={menuOpen ? 'open' : ''}>
        <div className="brand">Vesec</div>
        <nav>
          {MENU.map((m) => (
            <button key={m.id} className={m.id === current.id ? 'active' : ''} onClick={() => setPage(m.id)}>
              {m.label}{m.soon && <span className="soon">brzy</span>}{m.id === 'ukoly' && poLhute > 0 && <span className="badge">{poLhute}</span>}
            </button>
          ))}
        </nav>
        <div className="user">
          <div className="muted small">{session.user.email}</div>
          <button onClick={() => supabase.auth.signOut()}>Odhlásit</button>
        </div>
      </aside>
      <main>
        <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)}>☰ Menu</button>
        {loadErr && <div className="error">{loadErr}</div>}
        {current.id === 'prehled' && <Prehled vydaje={vydaje} jz={jz} />}
        {current.id === 'vydaje' && <DataTable title="Výdaje" table="vydaje" cols={VYDAJE_COLS} rows={vydaje} setRows={setVydaje} />}
        {current.id === 'jitka' && <DataTable title="Jitka – pohyby peněz" table="pohyby_jz" cols={JZ_COLS} rows={jz} setRows={setJz} />}
        {current.id === 'ukoly' && (
          <DataTable
            title="Úkoly" table="ukoly" cols={UKOLY_COLS} rows={ukoly} setRows={setUkoly}
            defaultSort={[{ key: 'stav', dir: 'desc' }, { key: 'termin', dir: 'asc' }]}
            rowClass={(r) => (r.stav === 'hotovo' ? 'done' : r.termin && r.termin < today ? 'overdue' : '')}
            onSaved={ukolSaved}
          />
        )}
        {current.id === 'harmonogram' && (
          <Harmonogram rows={harm} setRows={setHarm} nastaveni={nastaveni} setNastaveni={setNastaveni} />
        )}
        {current.soon && (
          <div className="page"><div className="page-head"><h1>{current.label}</h1></div>
            <p className="muted">Tuhle část připravujeme v další etapě.</p></div>
        )}
      </main>
    </div>
  )
}
