import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const configOk = Boolean(url && key)

// Trvalé přihlášení: session se ukládá v prohlížeči a sama se obnovuje.
export const supabase = configOk
  ? createClient(url, key, {
      db: { schema: 'rd_vesec' },
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
