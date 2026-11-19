# Putzplan

Vue 3 + Supabase, PWA für einen Zwei-Personen-Haushalt: Putzplan mit Punkten, Pinnwand, Listen.
Alle Befehle in diesem Ordner (`putzplan_vue/`):

- `npm run dev` — Dev-Server
- `npm run build` — Typprüfung + Build nach `dist/`
- `npm run type-check` — nur Typprüfung (`vue-tsc`)
- `npx supabase functions deploy complete-task` — Edge Function deployen (`db push` tut das nicht)

Deploy: Push auf `main` → GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages.
Projektregeln und Doku: `../CLAUDE.md`.
