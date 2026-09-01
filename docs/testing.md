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
