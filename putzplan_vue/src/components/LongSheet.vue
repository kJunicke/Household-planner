<script setup lang="ts">
/**
 * The **langer Zettel** shell — the paper itself, nothing on it.
 *
 * Extracted from ShoppingView (pinnwand-ausbau Ticket 07): only the paper's
 * edge/tear ("Kante, Linien") and the list-switcher tab strip ("Kopfzeile"),
 * per the CONTEXT.md glossary entry for **langer Zettel**. Everything that
 * goes ON the paper — category headings, entries, add-lines — stays owned
 * by each screen; this component never renders a single one of them.
 *
 * One template, no `v-if` on the design: in the classic Aussehen every
 * element below renders with zero styling (see `<style>`), in Pinnwand it
 * gets the paper look. The split lives entirely in the gated CSS.
 *
 * `hasContent` mirrors the caller's own "is there a current list" check —
 * the sheet itself must not render (not even empty) when there's nothing to
 * show, exactly like `.sheet` never rendered in ShoppingView before this
 * extraction. The tab strip renders unconditionally, matching the original
 * markup where `.list-chip-bar` sat outside any `v-if`.
 */
defineProps<{
  hasContent: boolean
}>()
</script>

<template>
  <div class="long-sheet">
    <slot name="tabs" />
    <div v-if="hasContent" class="sheet">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   PINNWAND-AUSSEHEN — „Der lange Zettel", die Papierhülle
   --------------------------------------------------------------------------
   Alles ab hier haengt an `:root[data-design='pinnwand']`. Ohne das Attribut
   greift keine einzige Regel — das klassische Aussehen bleibt Wort fuer Wort
   der Normalfall (`.long-sheet` traegt sonst nirgends Styles).

   `:deep()` reicht durch bis in den `#tabs`-Slot, weil der Tab-Streifen
   (`.list-chip-bar` samt Kindern) von der jeweiligen Elternview kommt, nicht
   von dieser Komponente. `.sheet` selbst braucht kein `:deep()` — es ist
   dieser Komponente ihr eigenes Element.
   ========================================================================== */

/* ---- Listenwechsel: Klebestreifen-Reiter an der Blattkante ---------------- */
:root[data-design='pinnwand'] .long-sheet :deep(.list-chip-bar) {
  background: none;
  border-radius: 0;
  padding: 0 4px;
  /* Die Reiter kleben auf der Oberkante des Blattes. */
  margin-bottom: -6px;
  position: relative;
  z-index: 2;
}
:root[data-design='pinnwand'] .long-sheet :deep(.list-chip-container) {
  gap: 6px;
  padding: 0;
  align-items: flex-end;
}
:root[data-design='pinnwand'] .long-sheet :deep(.list-chip) {
  min-height: var(--touch-target-min);
  padding: 4px 12px 10px;
  border: 2px solid var(--pw-line);
  border-bottom: none;
  border-radius: 0;
  background: var(--pw-tape);
  color: var(--pw-ink);
  font-weight: 700;
  transform: rotate(-0.6deg);
  transition: none;
}
:root[data-design='pinnwand'] .long-sheet :deep(.list-chip:hover) {
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
/* Aktiv = derselbe Papierton wie das Blatt darunter, zwei Pixel tiefer gesetzt
   und fetter: der Reiter geht in das Blatt ueber, statt darauf zu liegen. */
:root[data-design='pinnwand'] .long-sheet :deep(.list-chip.active) {
  background: var(--pw-paper);
  color: var(--pw-ink);
  font-weight: 800;
  transform: translateY(2px);
  padding-bottom: 12px;
}
:root[data-design='pinnwand'] .long-sheet :deep(.list-chip.add-chip) {
  background: var(--pw-cork-deep);
  color: var(--pw-ink);
  padding: 4px 12px 10px;
}
:root[data-design='pinnwand'] .long-sheet :deep(.list-chip.add-chip:hover) {
  background: var(--pw-tape);
  color: var(--pw-ink);
}
/* Der Stift im Reiter mass 12×12px. Sichtbar bleibt er klein, treffbar wird er
   ueber das Pseudo-Element — 28 + 2×10 = 48px in beiden Richtungen. */
:root[data-design='pinnwand'] .long-sheet :deep(.chip-edit-btn) {
  position: relative;
  width: 28px;
  height: 28px;
  justify-content: center;
  margin-left: 4px;
  opacity: 1;
  color: var(--pw-ink);
  font-size: var(--font-sm);
}
:root[data-design='pinnwand'] .long-sheet :deep(.chip-edit-btn)::after {
  content: '';
  position: absolute;
  inset: -10px;
}

/* ---- Das Blatt ----------------------------------------------------------
   Der Kontrast entsteht nicht aus einer Fuellung gegen Kork, sondern aus
   einer Papierflaeche mit harter Tintenkante. Seiten hart geschnitten, oben
   und unten abgerissen. */
:root[data-design='pinnwand'] .sheet {
  position: relative;
  background: var(--pw-paper);
  border-left: 2px solid var(--pw-line);
  border-right: 2px solid var(--pw-line);
  box-shadow: 3px 3px 0 var(--pw-line);
  padding: 14px 8px 18px;
  margin-top: 10px;
  margin-bottom: 14px;
}
/* Abrisskante: Papierzacken auf einer um 2px versetzten Tintenzacke. */
:root[data-design='pinnwand'] .sheet::before,
:root[data-design='pinnwand'] .sheet::after {
  content: '';
  position: absolute;
  left: -2px;
  right: -2px;
  height: 10px;
  background:
    linear-gradient(135deg, var(--pw-paper) 50%, transparent 50%) 0 0 / 14px 10px repeat-x,
    linear-gradient(-135deg, var(--pw-paper) 50%, transparent 50%) 7px 0 / 14px 10px repeat-x,
    linear-gradient(135deg, var(--pw-line) 50%, transparent 50%) 0 2px / 14px 10px repeat-x,
    linear-gradient(-135deg, var(--pw-line) 50%, transparent 50%) 7px 2px / 14px 10px repeat-x;
  pointer-events: none;
}
:root[data-design='pinnwand'] .sheet::before { top: -10px; transform: scaleY(-1); }
:root[data-design='pinnwand'] .sheet::after { bottom: -10px; }
</style>
