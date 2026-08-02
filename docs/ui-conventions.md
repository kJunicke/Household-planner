# UI- & CSS-Konventionen

## UI Patterns

- **Vue Modals**: Teleport + `v-if` für alle Forms (TaskCreateModal, TaskEditModal, TaskCompletionModal etc.)
- **Nicht Bootstrap Modals**: Vue-3-Kompatibilitätsprobleme
- **Modal Pattern**: zentralisierte Utility-Styles in `utilities.css` (flexbox, scrollable body)
- **FAB Pattern** (CleaningView):
  - EIN Floating Action Button unten rechts (Material Design Standard, thumb-freundlich)
  - Glyph: Lupe + kleines weißes +-Badge → signalisiert „suchen UND erstellen"
  - Öffnet das Such-Overlay; bei Eingabe erscheinen die Aktionen Erstellen / Quick-Aufgabe
  - Farbregel: FAB indigo (primär), +-Badge weiß-auf-indigo (kein grünes Erstellen-Signal,
    Grün bleibt ausschließlich für „erledigt/abschließen")

## CSS Architecture

- **Design System**: CSS Variables in `base.css`
  - Farben, Spacing, Shadows, Border-Radius, Transitions
  - **Font Sizes**: `--font-xs` bis `--font-xl` (10px–18px)
  - **Touch Targets**: `--touch-target-min: 48px` (Android Standard)
- **Bootstrap Overrides**: zentrale Button/Card/Form-Styles in `base.css`
- **Utility Classes**: wiederverwendbare Patterns in `utilities.css`
  - Auth-Container Pattern (Login/Register/HouseholdSetup)
  - Modal Pattern (TaskCompletionModal, HistoryView)
  - Page-Container Pattern (alle Views)
  - Section-Title Pattern
  - Empty-State Pattern
  - Form-Group Utility
  - **Icon Button Utility** (`.btn-icon`) — 48px quadratische Touch-Buttons
- **Component Styles**: nur component-spezifische Styles in `<style scoped>`
- **Mobile-First Touch Targets**: alle interaktiven Buttons min. 48×48px
