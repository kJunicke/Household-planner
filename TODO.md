# Putzplan TODOs

## Aktuelle Aufgaben

### Komponenten
- [x] TaskCard Komponente für einzelne Aufgaben
  - [x] Task Interface erstellen (mit union types für effort und recurrence)
  - [x] Props Interface erstellen  
  - [x] defineProps implementieren
  - [x] Bootstrap Card-Struktur im Template
  - [x] Conditional rendering für recurrence types
  - [x] Event Emission für Task-Completion (defineEmits)
  - [x] handleCompleteTask Funktion implementiert
  - [ ] Hilfsdaten für Darstellung erstellen (später)
  - [ ] CSS Hover-Effekte
  - [x] Button für "Aufgabe erledigen"
- [x] TaskList Komponente für Aufgabenliste
  - [x] Task Interface in zentrale types/Task.ts auslagern
  - [x] Props Interface für tasks: Task[] erstellen
  - [x] TaskCard Import implementieren
  - [x] v-for Loop für Task-Rendering
  - [x] Bootstrap Grid Layout (col-12 col-md-6 col-lg-3)
  - [x] Integration in App.vue (TaskList verwendet)
  - [x] Bootstrap Margins für vertikale Abstände (mb-3)
  - [x] Event Pass-Through für Task-Completion (defineEmits)
  - [ ] Leere Liste Handling

### Task-Completion Feature
- [x] Task Interface um completed:boolean erweitert
- [x] Event-Chain implementiert (TaskCard → TaskList → App.vue)
- [x] completeTask Funktion in App.vue
- [x] Test-Daten um completed-Status erweitert
- [x] Computed Properties für TODO/Completed Filterung implementiert
- [x] Separate Bereiche für offene und abgeschlossene Tasks
- [ ] Task Toggle Feature (completed true ↔ false)
  - [ ] TaskCard.vue: handleCompleteTask zu handleToggleTask erweitern
  - [ ] TaskCard.vue: Computed properties für buttonText und buttonClass
  - [ ] TaskCard.vue: Conditional Button Styling (btn-success vs btn-warning)
  - [ ] Event-Chain anpassen: completeTask → toggleTask mit Status-Parameter
  - [ ] App.vue: toggleTask Funktion implementieren (Status umschalten statt nur auf true setzen)
- [ ] Visuelles Styling für completed Tasks
- [ ] Bootstrap Button Varianten für verschiedene Task-Stati

### Test-Daten Integration
- [x] Test-Tasks JSON-Datei erstellt (src/data/testTasks.json)
- [x] JSON Import und Type Assertion in App.vue
- [x] Vue 3 Composition API (ref, onMounted) implementiert
- [x] Reaktive Tasks-Liste mit onMounted Lifecycle

### UI/UX
- [x] Aufgaben-Liste auf der Main Page anzeigen
- [ ] Bootstrap Styling für Task-Komponenten
- [ ] Responsive Design für mobile Geräte

### Backend Integration
- [ ] Supabase Datenbankschema für Tasks erstellen
- [ ] Task-Store mit Pinia implementieren
- [ ] CRUD-Operationen für Aufgaben