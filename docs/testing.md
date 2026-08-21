# Testing & Browser-Automatisierung

## Code-Qualität

```bash
npm run type-check && npm run lint
npm run build   # optional
```

## Test Accounts (E2E)

**Account 1**
- Email: `test@example.com`
- Passwort: `test123456`
- Haushalt: Test-Haushalt
- Invite Code: `FD1EB9CE`

**Account 2**
- Email: `test2@example.com`
- Passwort: `test123456`
- Haushalt: Test-Haushalt (beigetreten via `FD1EB9CE`)

## Claude-in-Chrome (Browser-Erweiterung)

- **Test-URL**: `http://localhost:5173/Household-planner/`
- Features IMMER mit der Chrome-Erweiterung testen (`mcp__claude-in-chrome__*` Tools),
  NICHT mehr mit Playwright
- Tools bei Bedarf via ToolSearch laden (Core-Set: `tabs_context_mcp`, `navigate`,
  `computer`, `read_page`); für Debugging `read_console_messages`
- **Mobile Testing**: IMMER mit schmalem Viewport testen (z.B. 390×800 für Smartphone).
  `resize_window` vor dem Testen aufrufen — Desktop-Breite ist kein echtes Mobile Testing.

## Messen im Browser — drei Fallen, die schon Befunde erfunden haben

In zwei Abnahme-Läufen war **dreimal der Aufbau der Befund**, nicht der Code. Diese
drei kosten sonst jedes Mal eine halbe Runde:

**1. Der Viewport lässt sich nicht beliebig verkleinern.** `resize_window` auf 300 px
lieferte hier `innerWidth = 520` — Chrome geht auf diesem System nicht tiefer. 390 px
emuliert man, indem man `.app-wrapper` per injiziertem `<style>` auf `width: 390px`
klemmt (ergibt `wall.clientWidth = 370`, exakt der Wert eines echten 390-px-Geräts:
390 − 2×8 Polster − 4 Rahmen). **Vorher belegen, dass keine breitenabhängigen
`@media`-Regeln beteiligt sind** — sonst ist die Emulation unvollständig. Und den
injizierten Block am Ende wieder entfernen.

**2. Der ferngesteuerte Tab ist `document.hidden === true` — dort frieren laufende
CSS-Transitions ein.** Ein Aussehen-Umschalter zeigte dadurch zweimal Scheindifferenzen
an Elementen mit 0,15 s bzw. 0,2 s Übergang. Mit `transition: none !important` (und
`animation`) von Anfang an fiel die Differenz auf 0.

**3. Gedrehte Elemente: `getBoundingClientRect` bläht auf.** Die Pinnwand neigt jeden
Zettel um 3°; über Rects gezählt ergab das 63 statt 42 Nachbarpaare. Für Geometrie
`style.left`/`style.top`/`offsetHeight`/`computedStyle.width` nehmen oder die Drehung
per `transform: none` neutralisieren.

### Was eine Messung erst belastbar macht

- **Das Werkzeug zuerst gegen die Wirklichkeit halten.** Wer Layout-Code in der Seite
  nachbaut, um damit A/B zu rechnen, weist erst nach, dass der Nachbau den Live-Zustand
  reproduziert (hier: 0/60 Abweichungen bei Breiten, Positionen, z-Werten, Gesamthöhe).
- **Negativkontrolle.** „0 Verletzungen" ist wertlos, solange nicht gezeigt ist, dass
  derselbe Test auf dem alten Stand anschlägt.
- **Bei geänderten Beständen kein Vergleich gegen alte Grundlinien.** Lieber ein A/B auf
  identischem Bestand rechnen als zwei Zahlen aus verschiedenen Läufen nebeneinander legen.
- **Testdaten sind Teil des Tests.** Ein Präfix mit Leerzeichen machte einen unbreakbaren
  Titel umbrechbar; eine Kadenz-Änderung nach dem Verschieben erzeugte 87 Tage, die mit
  der Ursache nichts zu tun hatten. Folgt eine Zahl nicht aus dem Code, ist die fehlende
  Bedienreihenfolge die erste Hypothese.
- **Der laufende Dev-Server liefert manchmal veraltete Fassungen aus.** In der
  03-2/03-3-Abnahme kamen `taskStore.ts` und `WallView.vue` aus einem stale
  Transform-Cache in der Fassung *vor* dem Ticket — Symptome: alle Projektzettel
  fehlten (Render-Absturz `getProjectEffortTotal is not a function`, danach
  Kaskade `Cannot read properties of null (reading 'emitsOptions')`), bzw. alle
  Abzeichen standen dauerhaft auf 0 und im Netzwerk-Log fehlte die Abfrage ganz.
  Beides sah nach einem Befund aus und war keiner. Gegenprobe: die Symptome
  ließen sich per `git checkout` der geänderten Datei reproduzieren. Behebung:
  `touch` über `src/` und Hard-Reload — **nicht** den Server neu starten
  (er läuft absichtlich durch).

## Context7 (MCP)

Bei jedem Feature für Up-to-date Library-Docs konsultieren (Vue 3, Pinia, Supabase, TypeScript).
