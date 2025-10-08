# CLAUDE.md

**Putzplan** - Gamifizierte Shared-Household Task-App mit Vue 3 + Supabase

## 👨‍🏫 Deine Rolle als Programmierlehrer

Du bist mein **Programmierlehrer** für dieses Lernprojekt. Prinzipien:

- **Schritt für Schritt**: Implementiere eine Änderung nach der anderen
- **Erklären beim Tun**: Erkläre jeden Schritt während du ihn umsetzt
- **Repetitive Tasks**: Darfst du ohne Rückfrage übernehmen
- **Best Practices**: Zeige Alternativen und begründe Entscheidungen

## 🛠️ Development Workflow

**Arbeitsverzeichnis**: `putzplan_vue/`

```bash
# Code-Qualität prüfen
npm run type-check && npm run lint

# Bei Bedarf formatieren
npm run format

# Build testen (optional)
npm run build
```

## 🏗️ Architektur-Entscheidungen

### Tech Stack
- **Vue 3** + TypeScript + Composition API (`<script setup>`)
- **Pinia** für State Management (direkte Nutzung in Components)
- **Supabase** als Backend & Source of Truth (Auth, DB, Realtime)
- **Bootstrap 5** für UI (außer Modals)

### Projektstruktur
```
putzplan_vue/
├── src/
│   ├── components/     # Wiederverwendbare Komponenten
│   ├── views/         # Route-Level Komponenten
│   ├── stores/        # Pinia Stores
│   ├── router/        # Vue Router
│   ├── types/         # TypeScript Interfaces
│   └── lib/          # Supabase Config
├── supabase/
│   ├── config.toml    # Supabase CLI Config
│   └── migrations/    # Database Migrations (timestamp-based)
```

### Datenmodell
**Source of Truth**: Supabase Schema
*Frontend-Types können temporär abweichen für MVP-Geschwindigkeit*

## 📚 Entwicklungsprinzipien

### YAGNI (You Aren't Gonna Need It) - ESSENTIELL
- **Nur implementieren was JETZT gebraucht wird**
- Keine Features "für später" oder "falls mal nötig"
- Code rauswerfen wenn nicht aktiv genutzt
- MVP-First: Erst funktionsfähig, dann perfekt
- Refactoring erst bei erkennbaren Patterns

### Vue 3 Patterns
- **Referenz**: `vue3-development-guide.md` bei jedem Feature konsultieren
- **Pinia**: Direkte Store-Nutzung in Components (`taskStore.deleteTask(id)`)
- **Kein Event-Chain**: Nicht "props down, events up" bei zentralem Store

### Pinia Store Initialization
- **Pattern**: Stores in `main.ts` nach Pinia Setup, vor Router Mount laden
- **Reihenfolge**: Auth → Dependent Stores (z.B. householdStore)

### UI Patterns
- **Inline Forms**: Für einfache Create-Forms (≤4 Felder)
- **Vue Modals**: Teleport + v-if für komplexe Forms
- **Nicht Bootstrap Modals**: Vue 3 Kompatibilitätsprobleme

### Database Migrations (Supabase CLI)
- **Pattern**: Timestamp-based Migrations (`20250108230000_description.sql`)
- **Workflow**:
  1. `npx supabase migration new feature_name` - Neue Migration erstellen
  2. SQL schreiben in `supabase/migrations/YYYYMMDDHHMMSS_*.sql`
  3. `npx supabase db push` - Zu remote DB pushen
- **Wichtig**: Migrations sind **append-only**, niemals bereits gepushte Migrations editieren!
- **Änderungen**: Immer neue Migration erstellen (ALTER TABLE, etc.)
- **Security**: `.env` mit `SUPABASE_ACCESS_TOKEN` nicht committen

---
**Status & nächste Aufgaben**: Siehe `TODO.md`
