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

### 6. Die Wand ist im verborgenen Tab unsichtbar UND unklickbar

`.wall-notes` steht auf `opacity: 0; pointer-events: none`, bis `hasPacked` gesetzt ist —
und gesetzt wird es in einem `requestAnimationFrame`, das im verborgenen Tab **nie feuert**.
Jeder `elementFromPoint`-Test läuft dann stumm ins Leere und meldet „nichts überdeckt
irgendetwas", ohne dass irgendetwas gemessen wurde.

`hasPacked` vor solchen Tests von Hand setzen.

### 7. `wall.style.height` rundet auf ganze Pixel

Die CSSOM gibt `10129px` zurück, wo der Vue-`ref` `10129.010000000004` hält. Wer
Wandhöhen auf Gleichheit vergleicht, verliert damit genau die Nachkommastellen, um die es
geht — und ein „identisch" ist dann keine Aussage. Die Höhe aus dem `ref` lesen, nicht aus
dem Stil.

### 8. Ein per `createElement` erzeugtes Prüf-Element trägt kein `data-v-`

Damit greifen die scoped styles der Komponente nicht. Das Ding steht auf `position: static`
statt absolut, bestimmt die Elternbreite mit und liefert Zahlen, die es im echten Layout nie
gibt. So sind einmal „17 von 94 Zetteln ragen 3,5 px über die Papierkante" entstanden — die
Gegenprobe fand null.

Zum Vergleichen zweier CSS-Fassungen ist ein **injizierter Override** (`<style>` im Tab) das
sichere Mittel; die Datei selbst anzufassen ist unnötig und lädt zum Vergessen ein.

### 9. Ein Deploy ist erst geprüft, wenn das Bundle geprüft ist

Der Git-Stand sagt nichts darüber, was das Telefon lädt. Die App ist eine PWA mit
Workbox-Precaching und `registerType: autoUpdate`; der Service Worker liefert die alte
Fassung aus, bis er sich erneuert — auf iOS besonders zäh, weil das System die App
suspendiert statt sie zu beenden, sodass Wegwischen aus dem App-Umschalter oft nicht
reicht.

Im ausgelieferten Bundle nach einer Zeichenkette suchen, die es **nur** im neuen Stand gibt.
Und für den Gerätetest einen Vorschaltpunkt vorsehen, an dem der Tester ohne
Entwicklerwerkzeug erkennt, welche Fassung läuft.

## Testkonten und Testhaushalt

Für den Browser-QC gibt es drei bestätigte Konten im Live-Projekt:

| Datei | Konto | Haushalt |
| --- | --- | --- |
| `qc-login.env` | `qc-agent@putzplan.test` | `QC-Test-Haushalt` |
| `qc-login-2.env` | `qc-agent-2@putzplan.test` | `QC-Test-Haushalt` |
| `qc-login-3.env` | `qc-agent-3@putzplan.test` | keiner (für Einrichten, Beitreten, Gastlink) |

Im `QC-Test-Haushalt` darf der QC alles: erledigen, ausgleichen, den Kurs ändern. Der Haushalt
des Paars bleibt unberührt. Die Zugangsdaten liegen in mastermind unter
`Private/secrets/HouseholdPlanner/`, nie in diesem (öffentlichen) Repo.

- **Ein Agent tippt kein Passwort** in ein Formular, das an den Live-Host schickt, auch nicht auf
  Bitte. Die Knöpfe unten sind der Weg: sie melden ohne Tippen an (Kilians Wunsch, 20.11.2026).
- **Unbewertete Aufgaben entstehen über die Oberfläche nicht.** Für einen Test die Standardpunkte
  der Testaufgabe per `db query --linked` auf `NULL` setzen, nur in `QC-Test-Haushalt`.

### Ein-Tipp-Anmeldung auf dem Dev-Server

Auf `npm run dev` zeigt die Anmeldung unter dem Formular „Als QC 1 anmelden“ usw., und angemeldet
sitzt unten links ein Chip „Dev: <Konto>“: antippen, anderes Konto wählen, die App wechselt ohne
Abmelden und lädt dessen Haushalt. Kein Passwort wird getippt.

- **Woher die Konten kommen:** Das Vite-Plugin `devLogins` (`vite.config.ts`, nur `apply: 'serve'`)
  liest alle `qc-login*.env` (Schlüssel `QC_EMAIL`, `QC_PASSWORD`, optional `QC_LABEL` für den
  Knopftext) und liefert sie als virtuelles Modul `virtual:dev-logins`. Gesucht wird der erste
  Ordner `Private/secrets/HouseholdPlanner` oberhalb von `putzplan_vue/`, also der von mastermind;
  ein anderer Ordner geht über die Umgebungsvariable `HP_DEV_LOGINS_DIR`. Fehlt der Ordner, startet
  der Dev-Server normal, nur ohne Knöpfe. Geänderte Dateien übernimmt er ohne Neustart.
- **Nur auf diesem Rechner:** Mit `--host` ist der Dev-Server im LAN erreichbar; das Modul
  bekommt aber nur ein Aufruf von `localhost`/`127.0.0.1`/`::1`, alle anderen 403 (dort dann keine
  Knöpfe).
- **Nicht im Produktions-Build:** Plugin und Modul gibt es nur beim Serve, die Dev-Komponenten
  (`src/components/dev/`) laden hinter `import.meta.env.DEV` und fallen im Build heraus. Prüfen,
  nach jeder Änderung daran: `npm run build`, dann `dist/` nach den E-Mails, Passwörtern und
  „Testkonten“ durchsuchen — null Treffer. Negativkontrolle: dieselbe Suche über die vom
  Dev-Server ausgelieferten Dateien (`@id/__x00__virtual:dev-logins`,
  `src/components/dev/DevLoginButtons.vue`) muss treffen.
- **Zwei Konten brauchen zwei Origins:** Die Sitzung liegt im `localStorage` der Origin, ein
  Wechsel ersetzt sie. Für zwei gleichzeitige Konten `npm run dev -- --host` und das eine Konto auf
  `localhost:<port>`, das andere auf `127.0.0.1:<port>`. Ein Gastlink braucht eine dritte, noch nie
  angemeldete Origin (z. B. `[::1]:<port>` oder ein frisches Chrome-Profil); er ersetzt sonst die
  Sitzung der Origin.
- Ohne `.env` braucht der Dev-Server `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` aus der
  Prozessumgebung. Der Anon-Key ist öffentlich (er steht im ausgelieferten Bundle).

### Testkonten wiederherstellen

Die Bestätigung per E-Mail ist im Live-Projekt aus (`mailer_autoconfirm`), ein neues Konto ist
also sofort anmeldbar.

1. Ist ein Konto weg (Dashboard → Auth → Users), neu registrieren: in der App über „Registrieren“
   oder per `supabase.auth.signUp({ email, password })` mit dem Anon-Key, gleiche E-Mail wie oben,
   neues zufälliges Passwort.
2. Die Datei in `Private/secrets/HouseholdPlanner/` neu schreiben: `QC_EMAIL`, `QC_PASSWORD`,
   `QC_USER_ID` (die neue `auth.users.id`), bei Bedarf `QC_LABEL`.
3. Haushalt: QC 1 legt `QC-Test-Haushalt` an (oder er besteht noch), QC 2 tritt mit dessen
   Einladungscode bei. QC 3 bleibt ohne Haushalt; ist es versehentlich beigetreten, gibt es in der
   App kein Austreten: die Zeile in `household_members` löscht Kilian (Dashboard oder SQL).
4. Prüfen (nur lesen): `npx supabase db query --linked "select h.name, count(*) from
   household_members m join households h using (household_id) where h.name = 'QC-Test-Haushalt'
   group by h.name"` → 2 Mitglieder.
