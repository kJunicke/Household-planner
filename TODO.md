# Putzplan TODOs

## Aktuelle Aufgaben

### Komponenten
- [ ] TaskCard Komponente für einzelne Aufgaben
  - [x] Task Interface erstellen (mit union types für effort und recurrence)
  - [x] Props Interface erstellen  
  - [x] defineProps implementieren
  - [x] Bootstrap Card-Struktur im Template
  - [x] Conditional rendering für recurrence types
  - [ ] Hilfsdaten für Darstellung erstellen (später)
  - [ ] CSS Hover-Effekte
  - [x] Button für "Aufgabe erledigen"
- [ ] TaskList Komponente für Aufgabenliste
  - [ ] Task Interface in zentrale types/Task.ts auslagern
  - [ ] Props Interface für tasks: Task[] erstellen
  - [ ] TaskCard Import implementieren
  - [ ] v-for Loop für Task-Rendering
  - [ ] Bootstrap Grid Layout (col-md-4 mb-3)
  - [ ] Integration in App.vue (Test-Tasks als Array)
  - [ ] Leere Liste Handling

### UI/UX
- [ ] Aufgaben-Liste auf der Main Page anzeigen
- [ ] Bootstrap Styling für Task-Komponenten
- [ ] Responsive Design für mobile Geräte

### Backend Integration
- [ ] Supabase Datenbankschema für Tasks erstellen
- [ ] Task-Store mit Pinia implementieren
- [ ] CRUD-Operationen für Aufgaben