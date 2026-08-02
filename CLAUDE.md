# CLAUDE.md

**Putzplan** — gamifizierte Shared-Household Task-App mit Vue 3 + Supabase.

## General
- Antworte extrem kurz, lege mehr Wert auf Übersichtlichkeit statt Grammatik

## Arbeitsweise

- **Arbeitsverzeichnis**: `putzplan_vue/`
- **`npm run dev` läuft bereits** — nicht neu starten
- Vor dem Abschluss: `npm run type-check && npm run lint`
- **Tests sind grundsätzlich manuell.** Es gibt bewusst kein Test-Framework (kein Vitest,
  kein Jest, kein Playwright) und keine automatisierten Tests. Nicht nachfragen, ob eins
  eingeführt werden soll, und keins ungefragt hinzufügen.
- Features IMMER mit der Claude-in-Chrome-Erweiterung testen, mobil mit schmalem
  Viewport → [docs/testing.md](docs/testing.md). Das ist die einzige Verifikationsstufe:
  auch reine Logik wird über die laufende App geprüft, nicht über Unit-Tests.
- Skills, die TDD voraussetzen (`/implement`, `/tdd`), fallen hier auf manuelle
  Verifikation zurück — Red-Green-Slices werden durch Prüfschritte in der App ersetzt.
- Bei neuen Bugs: Eintrag in [BUG-PATTERNS.md](BUG-PATTERNS.md)
- Offene Aufgaben: [TODO.md](TODO.md)

## Entwicklungsprinzipien

**Vue 3 Patterns.** Composition API (`<script setup>`), Pinia direkt in Components
(`taskStore.deleteTask(id)`) — kein „props down, events up" bei zentralem Store.

**UI.** Vue-Modals via Teleport + `v-if` (keine Bootstrap-Modals), Touch-Targets min. 48px,
Design-Tokens in `base.css`, wiederverwendbare Patterns in `utilities.css`
→ [docs/ui-conventions.md](docs/ui-conventions.md)

## Tech Stack

Vue 3 + TypeScript · Pinia · Supabase (Auth, DB, Realtime, Edge Functions) · Bootstrap 5
(außer Modals) · kein Docker (Supabase-CLI via `npx`).

```
putzplan_vue/
├── src/
│   ├── assets/        # CSS (base.css, utilities.css, main.css)
│   ├── components/
│   ├── views/
│   ├── stores/
│   ├── router/
│   ├── types/
│   └── lib/           # Supabase Config
└── supabase/migrations/   # Timestamp-based SQL migrations
```

## Routes

| Route | View | Zweck |
|---|---|---|
| `/` | CleaningView | Task-Liste + Kategorie-Chips, FAB-Suche, Quick-Aufgaben |
| `/history` | HistoryView | Chronologie aller Completions |
| `/stats` | StatsView | Gamification-Statistiken |
| `/shopping` | ListsView | Subtabs Einkauf (ShoppingView) & Packlisten (PackingView) |
| `/notes` | NotesView | Haushalt-Notizen |
| `/login`, `/register`, `/household-setup` | — | Auth & Onboarding |

Detailverhalten je View → [docs/features.md](docs/features.md)

## Datenmodell (Kurzform)

Supabase-Schema ist Source of Truth. PKs heißen **nicht** `id` — wichtig für `.eq()`:
`households.household_id`, `household_members.user_id`, `tasks.task_id`,
`task_completions.completion_id`, `shopping_items.shopping_item_id`,
`shopping_categories.category_id`, `notes.note_id`.

- `tasks` nutzt **Soft Delete** (`deleted_at`) — Historie bleibt erhalten
- `task_completions` ist append-only und die **Single Source of Truth** für Punkte
- Task-Completion läuft über die Edge Function `complete-task`, nicht über DB-Trigger
- Erlaubte Subtask-Punktmodi hängen am `task_type`

Volles Schema, Recurrence-Logik und Subtask-Modi → [docs/data-model.md](docs/data-model.md)

## Migrations

Append-only, nie gepushte Migrations editieren. RLS für alle Tabellen.

```bash
npx supabase migration new my_feature_name
npx supabase db push
```

Details → [docs/migrations.md](docs/migrations.md)

## Credentials

**GitHub PAT** in `.env` im Root als `GITHUB_PAT=...` (gitignored), fine-grained mit
`Contents: read+write` und `Pull requests: read+write`. `.env` niemals committen.

## Agent skills

- **Issue tracker**: Issues und Specs als Markdown unter `.scratch/<feature-slug>/`
  (gitignored) → [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
- **Triage labels**: die fünf kanonischen Rollen als `Status:`-Zeile im Issue-File
  → [docs/agents/triage-labels.md](docs/agents/triage-labels.md)
- **Domain docs**: single-context, `CONTEXT.md` + `docs/adr/` im Root
  → [docs/agents/domain.md](docs/agents/domain.md)
