# Vesec

Webová aplikace pro řízení stavby RD Vesec (Vite + React + Supabase).

- Data: Supabase projekt `ucetni-sw-dev`, schéma `rd_vesec` (tabulky `vydaje`, `pohyby_jz`).
- Přístup: přihlášení přes Supabase Auth; RLS pustí jen účet vlastníka. Mazání z webu není povolené – záznamy se jen označují příznakem `smazat`.
- Proměnné prostředí (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
