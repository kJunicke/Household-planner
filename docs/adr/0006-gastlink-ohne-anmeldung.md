# ADR-0006: Gastlink ohne Anmeldung — der Link ist der Schlüssel, Namen sind Vertrauenssache

**Status:** Angenommen · 19.11.2026

Gäste (Urlaub, Feier) sollen an **einer** Liste oder **einem** Topf mitarbeiten, ohne ein Konto
anzulegen. Entschieden: Wer den **Gastlink** hat, darf alles, was ein Gast darf; wer er ist,
wählt er selbst aus der Teilnehmerliste oder trägt sich neu ein, und der Browser merkt es sich.
Niemand prüft das — wer sich als „Lena“ ausgibt, ist für die App Lena. Das ist **gewollt**,
kein Sicherheitsloch: die Gruppe kennt sich, und eine Anmeldung wäre die Hürde, an der ein
Urlaubs-Einkauf scheitert.

Daraus folgt: **Rechte, die etwas sichern sollen, haben nur Haushaltsmitglieder** (mit Konto) —
Freigaben erneuern oder beenden, beim Beitritt bestätigen, dass ein Neuer an Ausgaben der
**ganzen Gruppe** mitträgt, einen Topf abschließen. Ein „Gast-Admin“ wäre ohne Anmeldung nur ein
Etikett. Unter Gästen darf jeder jeden Eintrag ändern; „geändert von“ macht es nachvollziehbar.

Ein weitergeleiteter Link lässt sich nur zurückholen, indem man ihn erneuert. Gäste arbeiten
nur online — die Offline-Warteschlange gehört Konto und Haushalt, ein Gast hat beides nicht.

## Verworfen

- **Gäste mit Konto** (Einladung per Mail, Anmeldung): sicher, aber jeder Gast müsste sich für
  einen Wochenend-Einkauf registrieren.
- **Ein Link je Anlass**, der Topf und Listen bündelt: erst einmal nicht — jede Liste und jeder
  Topf wird einzeln geteilt. Eine Klammer lässt sich später darüberlegen.
