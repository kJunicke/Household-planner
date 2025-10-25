# Changelog

## 2025-10-25 - Stats Tab mit Tortendiagramm ✅

### Features
- **Stats-View erstellt**: Neue Route `/stats` mit StatsView.vue für Gamification-Statistiken
- **Tortendiagramm**: Zeigt gewichtete Aufgabenverteilung nach Member (effort-gewichtet)
  - Verwendet vue-chartjs + Chart.js für Pie Chart
  - Berechnet Prozentanteile basierend auf effort (3 effort = 3x mehr wert als 1 effort)
  - Zeigt alle Household Members mit ihren Anteilen
  - Hover-Tooltip zeigt Punkte und Prozentsätze
- **Navigation erweitert**: Stats-Tab in Header.vue hinzugefügt (mit Pie-Chart Icon)

### Technisch
- Dependencies: `vue-chartjs` und `chart.js` installiert
- Context7 MCP für aktuelle Library-Dokumentation genutzt
- TypeScript-Typen für Chart.js Tooltip Callbacks
- ✅ TypeScript-Fehler behoben (taskStore.completions korrekt referenziert)
- ✅ Playwright MCP Tests erfolgreich auf localhost:5173

### Testing
- Playwright Browser-Test erfolgreich durchgeführt
- Chart wird korrekt angezeigt mit Daten aus task_completions
- Empty State funktioniert ("Noch keine Daten verfügbar")
- Navigation zwischen Tabs funktioniert