<script setup lang="ts">
interface Task {
     id: number
     title: string
     effort: 1 | 2 | 3 | 4 | 5 // effort a cleaning activity usually takes.
     //measured only with values 1-5 

     // Entweder nicht wiederholend ODER wiederholend mit Tagen
    recurrence:
      | { type: 'once' }
      | { type: 'recurring', days: number }
  }


// Typescript überprüft ob die übergebenen Daten auch wirklich ein Task sind
interface Props {
     task: Task
}

// props von der Elternkomponente werden in props gespeichert
// abrufbar als props.task...
const props = defineProps<Props>()


// SCHRITT 4: Hilfsdaten f�r die Darstellung
// Diese Objects helfen uns, Icons und Farben basierend auf Kategorien/Schwierigkeit anzuzeigen
// TODO: Erstelle Objects f�r:
// - categoryIcons: Icons f�r jede Kategorie (<s f�r kitchen, =� f�r bathroom, etc.)
// - categoryLabels: Deutsche Namen f�r Kategorien
// - difficultyColors: Bootstrap-Farben f�r Schwierigkeiten (success, warning, danger)
// - difficultyLabels: Deutsche Namen f�r Schwierigkeiten
</script>

<template>
  <!-- SCHRITT 5: Card-Struktur mit Bootstrap -->
  <!-- Bootstrap Cards sind perfekt f�r Task-Darstellung -->
  <!-- Eine Card hat: Header, Body, Footer -->
  
  <!-- TODO: Erstelle eine Bootstrap Card mit class="card h-100" -->
  <!-- h-100 sorgt daf�r, dass alle Cards gleich hoch sind -->
  
    <!-- CARD HEADER -->
    <!-- Hier zeigen wir Kategorie-Icon, Name und Schwierigkeit -->
    <!-- TODO: Erstelle einen card-header mit:
         - Links: Icon + Kategoriename
         - Rechts: Schwierigkeit als Badge -->
    
    <!-- CARD BODY -->
    <!-- Hier steht der Hauptinhalt: Titel, Beschreibung, Zeit, XP -->
    <!-- TODO: Erstelle einen card-body mit:
         - Titel als h6 mit class="card-title"
         - Beschreibung als p (nur wenn vorhanden)
         - Unten: Zeit und XP nebeneinander -->
    
    <!-- CARD FOOTER -->
    <!-- Hier kommt der Action-Button -->
    <!-- TODO: Erstelle einen card-footer mit einem Button
         - class="btn btn-primary btn-sm w-100"
         - Text: "Aufgabe erledigen" -->

</template>

<style scoped>
/* SCHRITT 6: CSS f�r Hover-Effekte */
/* 'scoped' bedeutet: Diese Styles gelten nur f�r diese Komponente */

/* TODO: F�ge CSS hinzu f�r:
   - .card: transition f�r sanfte Animationen
   - .card:hover: leichtes Anheben + Schatten-Effekt
   
   Tipp: transform: translateY(-2px) hebt die Card an
   Tipp: box-shadow: 0 4px 8px rgba(0,0,0,0.1) erstellt Schatten */
</style>