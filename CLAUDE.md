# Putzplan

Vue 3 + Supabase, PWA für einen Zwei-Personen-Haushalt; die App liegt in `putzplan_vue/`. **Mobile first**,
kleinster Viewport zuerst: jedes Feature muss auf Android **und** iOS funktionieren. Barrierefreiheit und
Tastaturbedienung sind kein Ziel, Gesten dürfen der einzige Weg sein.

## Git

- Remote `origin`: `github.com/kJunicke/Household-planner`, öffentlich. **Ein Push auf `main` deployt sofort**
  auf GitHub Pages (`.github/workflows/deploy.yml`).
- Prüfbefehle in `putzplan_vue/`, dieselben wie im Deploy: `npm run lint:check`, `npm run knip`, `npm test`,
  `npm run build`.

## Prüfen

- **UI wird von Hand geprüft**, im Browser über die Chrome-Erweiterung; ein UI-Test-Framework gibt es bewusst
  nicht. Messfallen im ferngesteuerten Tab und wie man einen Deploy prüft: [docs/testing.md](docs/testing.md).
- **Sichtbare Änderungen werden auch angesehen, nicht nur gemessen.** (05.09.2026: „ist doch nur CSS“ →
  abgeschnittene Stempelränder auf 261 von 282 Lagen; die Messung fragte „wie breit“, nicht „sieht es ganz
  aus“.)

## Supabase

- Projekt `uhgggnxsfqvmeduptdec` im **privaten** Supabase-Konto. Die CLI-Anmeldung eines Rechners
  kann ein anderes Konto sein: dann den Token aus mastermind `Private/secrets/supabase-personal.env`
  als `SUPABASE_ACCESS_TOKEN` setzen, nicht umloggen. Mit `supabase link --project-ref …` in
  `putzplan_vue/` reichen Token und Link für `migration list`, `db query --linked` und
  `db push --linked`; ein DB-Passwort braucht es nicht.
- Migrationen wendet niemand automatisch an: nach dem Merge `supabase db push --linked`, vorher
  `--dry-run`. Daten, die eine Migration umbaut, vorher mit `db query --linked` ansehen.
- **`db push` legt keine Transaktion um die Datei.** Braucht eine Migration eine (`LOCK TABLE`,
  alles-oder-nichts), schreibt sie `BEGIN;` … `COMMIT;` selbst.
- **`db push` deployt keine Edge Functions**, und eine veraltete Function versagt still (hier lief eine
  monatelang in alter Fassung): `npx supabase functions deploy <name>`, danach `npx supabase functions list`.
- Angelegte Testdaten bleiben nach der Verifikation stehen.

## Wissen

- Glossar ist [CONTEXT.md](CONTEXT.md); wo Skills `GLOSSARY.md` sagen, ist diese Datei gemeint.
- Getrackte Dateien verlinken nicht in den Tracker; Wesentliches wird übernommen.
