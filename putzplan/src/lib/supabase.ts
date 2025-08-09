import { createClient } from '@supabase/supabase-js'

// Umgebungsvariablen aus .env Datei laden
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fehlerbehandlung: Prüfen ob alle nötigen Variablen gesetzt sind
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL und Key müssen in der .env Datei gesetzt sein')
}

export const supabase = createClient(supabaseUrl, supabaseKey)