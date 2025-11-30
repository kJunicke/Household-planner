# Changelog

## Session 3: Vollständige Typography-Vereinheitlichung

### 1. Entfernung von Typography-Overrides (utilities.css)
**Problem:** `utilities.css` überschrieb `base.css` mit abweichenden Font-Sizes
- `.auth-title`: 1.875rem → nutzt jetzt h1 (1.5rem) aus base.css
- `.page-title`: 1.5rem/1.75rem Desktop → entfernt (nutzt h2: 1.25rem)
- `.modal-title`: 1.25rem → entfernt (nutzt h3: 1.125rem)
- `.section-title`: 1.25rem → entfernt (nutzt base.css)
- Nur noch Layout-Properties (margin, padding, border) in utilities.css

### 2. Semantisch korrekte HTML-Heading-Struktur
**Views:**
- LoginView/RegisterView: `h2` → `h1` (.auth-title)
- HouseholdSetupView: `h2` → `h1` (.auth-title), `h4` → `h3` (section-title)
- ShoppingView: `.section-title` → `h2` (.page-title), `h5` → `h3` (shopping-list-title)
- HistoryView/StatsView: Bereits korrekt (`h2` für page-title)

**Components:**
- Alle Modal-Titel: `h5` → `h3` (.modal-title)
- SubtaskManagementModal: `h6` → `h4` (section-title)
- TaskList: `h6` → `h3` (section-title "Abgeschlossene Projekte")
- TaskCard: `h6` → `h4` (task-title)
- Header: Bereits korrekt (`h1` für "Putzplan")

### 3. base.css Typography Guidelines (Dokumentation)
**Klare Verwendungsrichtlinien:**
- `h1` (1.5rem): Auth-Seiten, Main App Title
- `h2` (1.25rem): View-Überschriften
- `h3` (1.125rem): Modal-Titel, Section-Überschriften
- `h4-h6` (1rem): Subsections, Card-Titel

### 4. Playwright Mobile Testing (360x740)
**Verifizierte Views:**
- Login/Register: `h1` korrekt, konsistente Größe
- ShoppingView: `h2` für Titel, `h3` für "Zu kaufen"/"Gekauft"
- HistoryView/StatsView: `h2` korrekt
- SettingsSidebar: `h2` "Einstellungen", `h3` "Haushalt"/"Mitglieder"/"Profil"

### Ergebnis:
- ✅ 100% konsistente Typography app-weit (Single Source of Truth: base.css)
- ✅ Semantisch korrekte HTML-Heading-Hierarchie (h1 → h2 → h3 → h4)
- ✅ Keine Font-Size-Overrides mehr in Components/Views
- ✅ Bessere Accessibility & SEO durch korrekte Heading-Struktur

---

## Session 2: UX Optimierung - History & Stats Views + Zentralisierte Typography

### 1. Chip-Navigation mit Swipe-Gesten (CategoryNav.vue)
**Optimierung der Category-Navigation für Mobile UX:**
- Scrollbare Chip-Leiste (~40px statt 60px, 33% Platzersparnis)
- Material Design Pattern (wie Gmail, Google News)
- Swipe-Gesten: Links/Rechts swipen zum Tab-Wechsel (Threshold: 50px)
- Versteckte Scrollbar für cleanes Design
- Touch-optimiert mit iOS smooth scrolling
- 1-Click Tab-Wechsel (besser als Dropdown-Alternative)

### 2. Zentralisierte Typography System (base.css)
**App-weite Heading-Größen definiert:**
- `h1` → 1.5rem (Login/Register Titel)
- `h2` → 1.25rem (View-Titel: Verlauf, Stats, etc.)
- `h3` → 1.125rem, `h4-h6` → 1rem
- `.page-title` → 1.25rem (konsistent über alle Views)
- `.section-title` → 1rem (für Sub-Sections)
- Mobile-First Approach mit optimierten Line-Heights

### 3. History View Optimierung (HistoryView.vue)
**Kompakteres Design für mehr Content auf Screen:**
- Grünes Häkchen-Icon entfernt (war überflüssig - alle Items sind completed)
- Padding: `1rem` → `0.75rem` (~25% Platzersparnis)
- Gap zwischen Items: `0.75rem` → `0.5rem`
- Gap in completion-details: `0.5rem` → `0.375rem`
- Meta-Font-Size: `0.875rem` → `0.8125rem`
- Meta-Icons: `0.875rem` → `0.75rem`
- "Punkte" → "Pkt" (kompaktere Darstellung)
- Ergebnis: 3-4 History-Einträge sichtbar (statt 2)

### 4. Stats View Optimierung (StatsView.vue)
**Konsistente Typography + kompakteres Layout:**
- Entfernte lokale `.page-title` Override (nutzt zentrale 1.25rem statt 2rem)
- View-Padding: `2rem` → `1rem`
- Time-Period-Tabs: Gap `0.75rem` → `0.5rem`, Padding `1rem` → `0.75rem`
- Chart-Container: Höhe `420px` → `360px`, Padding `1.5rem` → `1rem`
- Card-Body: Padding `1rem` → `0.75rem`
- Mehr Platz für Charts bei gleicher Bildschirmgröße

### 5. Mobile Testing (Playwright - 360x740)
**Verifizierte Features:**
- Chip-Navigation: Swipe-Gesten funktionieren, kompaktes Design
- History View: Deutlich mehr Einträge sichtbar, kein unnötiges Häkchen
- Stats View: Konsistente Überschriften, optimierte Chart-Größe

### Ergebnis:
- 📏 Konsistente Typography app-weit (kein Font-Size-Chaos mehr)
- 📱 ~25-30% mehr Content auf Mobile Screen
- 🎯 Fokus auf Inhalt statt Whitespace
- ✨ Modernes, sauberes Design beibehalten
