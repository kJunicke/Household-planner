# Testing

## Die Regel über allen Fallen

**Eine Messung, die auf dem Ist-Stand nichts findet, ist kaputt — nicht der Code
sauber.**

Jeder Messlauf braucht eine **Negativkontrolle**: derselbe Test auf dem Stand
*vor* der Änderung muss nachweislich feuern. „0 Verletzungen" ohne
Negativkontrolle ist keine Aussage.

Und jeder Prüfschritt braucht einen **Beleg** — eine gemessene Zahl, ein
SQL-Ergebnis, einen Zeitstempelvergleich. „Sieht gut aus" ist kein Ergebnis.

## Messfallen im ferngesteuerten Tab

### 1. Der Viewport geht nicht unter ~500 px

Schmale Breiten über einen injizierten `<style>` an `.app-wrapper` klemmen
(`width: 390px`). Das Fenster selbst bleibt breit.

### 2. `document.hidden === true`

Der Tab ist für den Browser unsichtbar: Transitions frieren ein, **`requestAnimationFrame`
und `ResizeObserver` feuern gar nicht**, Timer sind gedrosselt.

Warte deshalb über **Mikrotasks**, und stoße direkt an, was sonst ein
`ResizeObserver` auslösen würde.

### 3. Layoutmaße kommen aus `style.*`, nicht aus dem gerenderten Kasten

Zettel hängen geneigt an der Wand — `getBoundingClientRect` liefert deshalb den
aufgeblähten **gedrehten Umriss**. Und `offsetWidth` rundet, was bei gebrochenen
Breiten einen **Scheinüberstand von bis zu 0,3 px** vortäuscht.

Für Layout und Kantenprüfungen also `style.left`, `style.top`, `style.width`,
`offsetHeight`. `getBoundingClientRect` nur, wenn du ausdrücklich den gedrehten
Umriss meinst — die beiden sind verschiedene Größen und gehören getrennt
ausgewiesen.

### 4. Scrollen im verborgenen Tab

`html { scroll-behavior: smooth }` friert jedes `scrollBy` ein — vorher auf
`auto` setzen.

Und das browsereigene **`overflow-anchor`** erzeugt am Seitenende ein
Δ`scrollY`, das **nicht aus der App kommt**. Mit `overflow-anchor: none`
gegenprüfen, bevor du so etwas als Befund meldest.

### 5. FLIP-Animationen frieren mit gesetztem `transform` ein

Die Flug-Animation läuft über die Web Animations API. Im verborgenen Tab bleibt
sie mit einem gesetzten `transform` stehen, von dem `style.top` nichts weiß —
einmal gemessen als `translate(0, -416px)`. CSS-Regeln wie `* { animation: none }`
greifen auf die WAAPI nicht. Nötig ist vor **jeder** Messung:

```js
document.querySelectorAll('*').forEach(el => el.getAnimations().forEach(a => a.cancel()))
```

### 6. `npx tsc` prüft `.vue`-Dateien überhaupt nicht

Es meldet dann sauber und ist trotzdem das falsche Werkzeug. Ein Umsetzer hat so einen
Typfehler in `WallNote.vue` als „tsc sauber" gemeldet; er lag nicht daran, dass er ihn
übersehen hätte, sondern daran, dass er das Gate nie ausgeführt hat.

```
npx vue-tsc --noEmit -p tsconfig.app.json
```

### 7. Die Wand ist im verborgenen Tab unsichtbar UND unklickbar

`.wall-notes` steht auf `opacity: 0; pointer-events: none`, bis `hasPacked` gesetzt ist —
und gesetzt wird es in einem `requestAnimationFrame`, das im verborgenen Tab **nie feuert**.
Jeder `elementFromPoint`-Test läuft dann stumm ins Leere und meldet „nichts überdeckt
irgendetwas", ohne dass irgendetwas gemessen wurde.

`hasPacked` vor solchen Tests von Hand setzen.

### 8. `wall.style.height` rundet auf ganze Pixel

Die CSSOM gibt `10129px` zurück, wo der Vue-`ref` `10129.010000000004` hält. Wer
Wandhöhen auf Gleichheit vergleicht, verliert damit genau die Nachkommastellen, um die es
geht — und ein „identisch" ist dann keine Aussage. Die Höhe aus dem `ref` lesen, nicht aus
dem Stil.

### 9. Ein per `createElement` erzeugtes Prüf-Element trägt kein `data-v-`

Damit greifen die scoped styles der Komponente nicht. Das Ding steht auf `position: static`
statt absolut, bestimmt die Elternbreite mit und liefert Zahlen, die es im echten Layout nie
gibt. So sind einmal „17 von 94 Zetteln ragen 3,5 px über die Papierkante" entstanden — die
Gegenprobe fand null.

Zum Vergleichen zweier CSS-Fassungen ist ein **injizierter Override** (`<style>` im Tab) das
sichere Mittel; die Datei selbst anzufassen ist unnötig und lädt zum Vergessen ein.

### 10. Ein Deploy ist erst geprüft, wenn das Bundle geprüft ist

Der Git-Stand sagt nichts darüber, was das Telefon lädt. Die App ist eine PWA mit
Workbox-Precaching und `registerType: autoUpdate`; der Service Worker liefert die alte
Fassung aus, bis er sich erneuert — auf iOS besonders zäh, weil das System die App
suspendiert statt sie zu beenden, sodass Wegwischen aus dem App-Umschalter oft nicht
reicht.

Im ausgelieferten Bundle nach einer Zeichenkette suchen, die es **nur** im neuen Stand gibt.
Und für den Gerätetest einen Vorschaltpunkt vorsehen, an dem der Tester ohne
Entwicklerwerkzeug erkennt, welche Fassung läuft.

## Repo-weite Formatierer

`npm run lint` läuft mit `--fix` quer über die uncommitteten Dateien anderer
Agenten. Solange parallel gearbeitet wird, nur lesend prüfen: `npx eslint <datei>`.

## Edge Functions

`supabase db push` deployt **keine** Edge Functions — der Repo-Stand sagt nichts
darüber, welche Fassung läuft, und das Versagen ist **still**: es sieht aus wie
ein Logikfehler. Hier lief eine Function einmal monatelang in einer alten Fassung.

```
npx supabase functions deploy <name>
npx supabase functions list
```

## Testdaten

Angelegte Testdaten bleiben nach der Verifikation stehen.
