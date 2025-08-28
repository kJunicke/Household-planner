# CLAUDE.md

Diese Datei bietet Anleitungen für Claude Code (claude.ai/code) bei der Arbeit mit dem Code in diesem Repository.

## Projektüberblick

Dies ist "Putzplan", eine gamifizierte Putzaufgaben-Verwaltungsanwendung, die als Vue.js 3 Projekt entwickelt wird. Die Anwendung soll dabei helfen, Haushalts-Putzaufgaben mit XP, Leveln, Achievements und Ranglisten zu verfolgen und zu gamifizieren. Die Hauptentwicklung findet im `putzplan_vue/` Unterverzeichnis statt.

**Wichtig: Dies ist ein Lernprojekt.** Das primäre Ziel ist es, dem Benutzer beizubringen, wie man moderne Webanwendungen entwickelt. Bei der Arbeit mit dieser Codebasis solltest du immer:
- Erklären, was du machst und warum
- Best Practices und Entwicklungsmuster beibringen
- Alternative Ansätze zeigen, wo relevant
- Dem Benutzer helfen, die zugrundeliegenden Konzepte zu verstehen
- Lehrreich sein, anstatt nur Features zu implementieren

## Projektstruktur

Das Repository hat eine verschachtelte Struktur:
- Root-Verzeichnis enthält eine übergeordnete `package.json` mit Supabase-Abhängigkeit
- `putzplan_vue/` enthält die Haupt-Vue.js-Anwendung
- Entwicklungsplan ist in `putzplan-dev-plan.md` dokumentiert (Deutsch)

## Häufige Befehle

Alle Befehle sollten aus dem `putzplan_vue/` Verzeichnis ausgeführt werden:

```bash
cd putzplan_vue
```

### Entwicklung
- `npm run dev` - Entwicklungsserver mit Hot Reload starten
- `npm run build` - Type-Check, kompilieren und minifizieren für Produktion  
- `npm run build-only` - Build ohne Type-Checking
- `npm run preview` - Produktions-Build lokal vorschauen

Du brauchst keine Dev Server zu runnen. Du hast eh keinen Zugriff auf den Browser und ich hab immer einen am laufen. 

### Code-Qualität
- `npm run lint` - ESLint mit Auto-Fix ausführen
- `npm run format` - Code mit Prettier formatieren
- `npm run type-check` - Vue TypeScript Compiler ausführen

## Tech Stack & Architektur

- **Frontend**: Vue.js 3 mit Composition API und `<script setup>` Syntax
- **TypeScript**: Vollständige TypeScript-Unterstützung mit vue-tsc
- **State Management**: Pinia Stores (Composition API Stil)
- **Routing**: Vue Router mit lazy-loaded Routes
- **Build Tool**: Vite mit Vue Plugin und Dev Tools
- **Backend**: Supabase (Datenbank, Authentifizierung, Echtzeit)
- **Styling**: CSS mit scoped Styles, CSS Custom Properties

### Wichtige Verzeichnisse
- `src/components/` - Wiederverwendbare Vue-Komponenten
- `src/views/` - Route-Level-Komponenten  
- `src/stores/` - Pinia State Stores
- `src/router/` - Vue Router Konfiguration
- `src/assets/` - Statische Assets und globale Styles
- `src/lib/` - Utility-Bibliotheken und externe Service-Konfigurationen

### Architektur-Muster
- Verwendet Vue 3 Composition API mit `<script setup>` Syntax
- Pinia Stores folgen dem Composition API Muster mit `defineStore()`
- Route-Level Code Splitting mit dynamischen Imports
- Alias `@/` konfiguriert für `src/` Verzeichnis

## Geplante Entwicklungsfeatures

Basierend auf `putzplan-dev-plan.md` wird die Anwendung folgendes beinhalten:

### Kernfeatures
- Benutzerauthentifizierung über Supabase Auth
- Aufgabenverwaltung mit Kategorien (Küche, Badezimmer, Wohnzimmer)
- XP-System mit unterschiedlichen Belohnungen pro Aufgabenkategorie
- Level-Progression-System
- Achievement/Badge-System
- Streak-Tracking für tägliches Putzen
- Persönliche Statistiken und Fortschrittsverfolgung
- Ranglisten-Funktionalität

### Datenbankschema (Supabase)
- `tasks` - Aufgaben-Templates mit XP-Belohnungen und Kategorien
- `completed_tasks` - Abgeschlossene Aufgaben mit Zeitstempeln verfolgen
- `user_stats` - Benutzer-XP, Level, Streaks und Gesamtwerte
- `achievements` - Benutzer-Achievement-Freischaltungen

## Node.js Version

Benötigt Node.js `^20.19.0 || >=22.12.0` wie in package.json engines spezifiziert.

## Umgebungskonfiguration

Das Projekt verwendet Umgebungsvariablen für die Konfiguration:

### Setup
- Kopiere `.env.example` zu `.env` und fülle deine Werte ein
- Erforderliche Variablen:
  - `VITE_SUPABASE_URL` - Deine Supabase-Projekt-URL
  - `VITE_SUPABASE_ANON_KEY` - Dein Supabase Anon/Public Key (sicher öffentlich zu machen)

### Supabase Integration
- Supabase-Client ist in `src/lib/supabase.ts` konfiguriert
- Verwendet Umgebungsvariablen mit Fehlerprüfung
- Der Anon-Key ist öffentlich und kann sicher in Git committed werden
- Alle VITE_ prefixierten Variablen sind im Browser verfügbar

## Entwicklungsnotizen

- Das Projekt hat Supabase-Setup und Umgebungskonfiguration abgeschlossen
- Deutsche Sprache wird in Planungsdokumenten und wahrscheinlich der UI verwendet
- PWA-Features und mobile Optimierung sind geplant
- Echtzeit-Updates zwischen Geräten geplant über Supabase
- Aktuell ist kein Test-Framework konfiguriert