# Claude Code: Was wirklich Kontextfenster kostet

Recherche vom 2026-08-26. Quellen: ausschließlich die offizielle Dokumentation
unter <https://code.claude.com/docs/> sowie die auf dieser Maschine installierte
CLI (Version 2.1.233). Keine Blogposts, keine Sekundärquellen.

Alle Messwerte in diesem Dokument stammen aus eigenen Probeläufen mit
`claude -p --output-format stream-json --verbose --setting-sources ""`. Die
`system`/`init`-Nachricht dieses Modus listet die tatsächlich exponierten Tools
(`tools`), die geladenen Skills (`skills`) und die Slash-Commands
(`slash_commands`); die erste `assistant`-Nachricht liefert die Prompt-Token.
Quelle für dieses Diagnoseformat: <https://code.claude.com/docs/en/agent-sdk/typescript>.

---

## Urteilstabelle

| # | Behauptung | Urteil |
|:--|:-----------|:-------|
| 1 | `"disableWorkflows": true` entfernt das `Workflow`-Tool-Schema komplett aus dem Kontextfenster | **BESTÄTIGT** (Größe des Schemas: **DOKUMENTATION SCHWEIGT**, eigene Messung ≈ 7.900 Token) |
| 2 | `"disableBundledSkills": true` entfernt die Beschreibungszeilen der Bundled Skills | **BESTÄTIGT**, aber die Liste der „bundled" Skills in der Fragestellung ist teilweise falsch |
| 3 | Es gibt **keinen** settings.json-Key, der ein einzelnes Built-in-Tool-Schema entfernt | **WIDERLEGT** — `permissions.deny` mit blankem Toolnamen tut genau das |
| 4 | claude.ai-MCP-Connectors werden deferred/lazy geladen statt vollständig injiziert | **BESTÄTIGT** |
| 5 | `disable-model-invocation: true` hält Name+Beschreibung aus dem Kontext, `/skill-name` bleibt nutzbar | **BESTÄTIGT** |

---

## 1. `disableWorkflows` und das `Workflow`-Tool-Schema

### Was die Doku sagt

`disableWorkflows` „turn[s] off dynamic workflows and the bundled workflow
commands for everyone your settings reach".
Scope: **`Any file`** (User-, Projekt-, Local-, Managed-Settings — alle gültig).
Typ Boolean, Default `false`.
Quelle: <https://code.claude.com/docs/en/settings-reference#disableworkflows>

`enableWorkflows` ist der persönliche Gegenpart: „Turn dynamic workflows on or
off for yourself when your plan's default isn't what you want." Ebenfalls Scope
`Any file`, Default **unset** — Workflows sind an, außer im Pro-Plan, dort aus.
Der `/config`-Schalter **Dynamic workflows** schreibt diesen Key in die
User-Settings.
Quelle: <https://code.claude.com/docs/en/settings-reference#enableworkflows>

**Interaktion, wörtlich dokumentiert:** „`enableWorkflows: true` can't turn
workflows back on while any source turns workflows off." `disableWorkflows: true`
und die Organisationsrichtlinie haben Vorrang; Claude Code blendet die
`/config`-Zeile aus, sobald eine andere Quelle als die User-Settings
`enableWorkflows` setzt oder `disableWorkflows` auf `true` steht.
Quelle: <https://code.claude.com/docs/en/settings-reference#enableworkflows>

Pro Session zusätzlich: `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. „whichever of the two
turns them off, the other can't turn them back on."
Quelle: <https://code.claude.com/docs/en/env-vars>

Die Doku beschreibt die Wirkung als Feature-Abschaltung, nicht explizit als
Entfernung des Tool-Schemas: „When workflows are disabled, the bundled workflow
commands are unavailable, the `ultracode` keyword no longer triggers a run, and
`ultracode` is removed from the `/effort` menu."
Quelle: <https://code.claude.com/docs/en/workflows#turn-workflows-off>

Das `Workflow`-Tool selbst ist in der Tools-Referenz gelistet: „Runs a dynamic
workflow: a script that orchestrates many subagents in the background."
Quelle: <https://code.claude.com/docs/en/tools-reference>

### Was die Messung zeigt

| Konfiguration | `Workflow` in `tools` | Prompt-Token (Erstanfrage) |
|:--|:--|--:|
| Baseline (nichts gesetzt) | ja | 28.691 |
| `"disableWorkflows": true` | **nein** | 20.788 |
| `permissions.deny: ["Workflow"]` (Skill `deep-research` bleibt geladen) | **nein** | 20.791 |
| `"disableBundledSkills": true` | **ja** | 26.331 |

Damit ist die Behauptung **bestätigt**: `disableWorkflows: true` entfernt das
Tool aus dem an das Modell gesendeten Tool-Set — es ist nicht „nur deaktiviert".

Zwei Nebenbefunde, beide messbasiert:

* Die dritte Zeile isoliert das Tool-Schema: dort wurde ausschließlich das Tool
  verweigert, der Bundled Workflow `deep-research` blieb im Skill-Index. Die
  Differenz zur Baseline beträgt **≈ 7.900 Token**. Das ist eine eigene Messung,
  **keine publizierte Zahl** — siehe unten.
* `disableBundledSkills` allein entfernt das `Workflow`-Tool **nicht** (Zeile 4).
  Die Formulierung der Doku, `disableBundledSkills` entferne „bundled skills and
  workflows", meint die gebündelten *Workflow-Kommandos* wie `/deep-research`,
  nicht das `Workflow`-Tool. Quelle für den Wortlaut:
  <https://code.claude.com/docs/en/settings-reference#disablebundledskills>

### Gibt es eine publizierte Token-Zahl für das Workflow-Schema?

**DOKUMENTATION SCHWEIGT.** Die Seite „Explore the context window" listet die
Startup-Blöcke (System-Prompt, Auto-Memory, Environment-Info, MCP-Tools,
Skill-Beschreibungen, CLAUDE.md) mit Token-Zahlen, hat aber **überhaupt keinen
Posten für Built-in-Tool-Schemata**, und stellt außerdem klar: „The visualization
uses representative numbers."
Quelle: <https://code.claude.com/docs/en/context-window>

Der einzige dokumentierte Weg zu einer echten Zahl ist `/context`: „run
`/context` for a live breakdown by category with optimization suggestions".
Ob dieser Breakdown eine Kategorie für Tool-Definitionen ausweist, ist der Doku
**nicht** zu entnehmen.
Quellen: <https://code.claude.com/docs/en/context-window>,
<https://code.claude.com/docs/en/commands>

Als Größenordnungs-Anker nennt die SDK-Doku nur generisch: „Tool definitions can
consume large portions of the context window (50 tools can use 10-20K tokens)".
Quelle: <https://code.claude.com/docs/en/agent-sdk/tool-search>

Der oben gemessene Wert von ≈ 7.900 Token für das `Workflow`-Schema allein ist
demnach ungewöhnlich groß — plausibel, weil das Tool eine Skript-DSL entgegen
nimmt. Zum Vergleich, gleiche Methode: `permissions.deny: ["Artifact"]` senkt den
Prompt von 28.691 auf 22.922 Token, also **≈ 5.770 Token** für das
`Artifact`-Schema. Beide Zahlen sind Messungen dieser Maschine und dieser
Version, keine Zusagen.

---

## 2. `disableBundledSkills` und die Frage, was „bundled" heißt

### Was die Doku sagt

„Turn off the skills and workflows included with Claude Code. Claude Code removes
bundled skills and workflows entirely, while built-in commands such as `/init`
stay typable but are hidden from the model."
Scope `Any file`, Boolean, Default unset.
Quelle: <https://code.claude.com/docs/en/settings-reference#disablebundledskills>

Explizit und unmissverständlich: „**Skills from plugins, `.claude/skills/`, and
`.claude/commands/` are unaffected.**"
Quellen: <https://code.claude.com/docs/en/settings-reference#disablebundledskills>,
<https://code.claude.com/docs/en/env-vars> (zu `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`)

Damit ist der Teilanspruch „Projekt-Skills in `.claude/skills/` sind nicht
betroffen" **bestätigt**.

Ausnahme `/doctor`: bleibt ab v2.1.205 tippbar; verstecken nur über
`DISABLE_DOCTOR_COMMAND` oder einen `skillOverrides`-Eintrag `"doctor": "off"`.
Quelle: <https://code.claude.com/docs/en/skills#bundled-skills>

Dass es um Kontextzeilen geht und nicht bloß um Verfügbarkeit, sagt die
Skills-Doku an anderer Stelle: der Skill-Index besteht aus „One-line descriptions
of available skills so Claude knows what it can invoke."
Quelle: <https://code.claude.com/docs/en/context-window>

### Welche Skills sind bundled — gemessen

Die `init`-Nachricht einer Baseline-Session ohne Projekt- und User-Settings
listet im Feld `skills` genau **19** Einträge:

```
deep-research, design-sync, dataviz, artifact-design, artifact-diagramming,
artifact-capabilities, update-config, verify, debug, code-review, simplify,
batch, fewer-permission-prompts, doctor, loop, schedule, claude-api, run,
run-skill-generator
```

Mit `"disableBundledSkills": true` schrumpft dieses Feld auf **`["doctor"]`** —
exakt wie dokumentiert.

Bezogen auf die in der Fragestellung genannten Kandidaten:

| Name | Bundled Skill? | Beleg |
|:--|:--|:--|
| `artifact-design` | **ja** | `skills`-Feld der init-Nachricht |
| `artifact-diagramming` | **ja** | dito |
| `artifact-capabilities` | **ja** | dito |
| `simplify` | **ja** | dito + <https://code.claude.com/docs/en/commands> („**Skill**") |
| `claude-api` | **ja** | dito + Commands-Referenz |
| `dataviz` | **ja** | dito + Commands-Referenz |
| `run` | **ja** | dito + <https://code.claude.com/docs/en/skills#run-and-verify-your-app> |
| `loop` | **ja** | dito + Commands-Referenz |
| `schedule` | **ja** | `skills`-Feld (Commands-Referenz beschreibt `/schedule` ohne **Skill**-Marker) |
| `fewer-permission-prompts` | **ja** | dito + Commands-Referenz |
| `update-config` | **ja** | `skills`-Feld |
| `security-review` | **nein** — Built-in-Command | steht in `slash_commands`, nicht in `skills`; in <https://code.claude.com/docs/en/commands> ohne **Skill**-Marker |
| `init` | **nein** — Built-in-Command | dito; die Doku nennt `/init` ausdrücklich als Beispiel für „built-in commands … stay typable but are hidden from the model" |
| `keybindings-help` | **nein** | kein Eintrag in `skills`; die Doku kennt nur `/keybindings` als Built-in-Command (<https://code.claude.com/docs/en/commands>) |
| `statusline-setup` | **nein** — Subagent, kein Skill | erscheint in der init-Nachricht unter `agents`, nicht unter `skills` |

Zusätzlich bundled, in der Fragestellung nicht genannt: `deep-research`,
`design-sync`, `verify`, `debug`, `code-review`, `batch`, `doctor`,
`run-skill-generator`.

Gemessene Ersparnis von `disableBundledSkills` allein: 28.691 → 26.331 Token,
also **≈ 2.360 Token**.

### Feinsteuerung statt Alles-oder-nichts

`skillOverrides` erlaubt vier Zustände pro Skill, ohne die SKILL.md anzufassen:
`"on"` (Name + Beschreibung im Kontext), `"name-only"` (nur Name),
`"user-invocable-only"` (im Kontext versteckt, im `/`-Menü sichtbar), `"off"`
(ganz versteckt).
Quelle: <https://code.claude.com/docs/en/skills#override-skill-visibility-from-settings>

---

## 3. „Kein settings.json-Key entfernt ein einzelnes Tool-Schema" — falsch

Diese Behauptung ist **schlicht falsch**, und zwar in allen drei Teilaussagen.

### (a) Blockiert `permissions.deny` / `--disallowedTools` nur die Ausführung? Nein.

Die Permissions-Doku sagt es wörtlich:

> „Deny rules behave differently depending on whether they name a tool or scope a
> pattern within one. **A bare tool name like `Bash` removes the tool from
> Claude's context entirely, so Claude never sees it.** … A scoped rule like
> `Bash(rm *)` leaves the tool available and blocks matching calls when Claude
> attempts them."

Quelle: <https://code.claude.com/docs/en/permissions> (Abschnitt „Manage permissions" → „Deny rules")

Ebenso für Globs: „A tool matched by a bare-name glob deny rule is removed from
Claude's context, the same as a bare tool name."
Und: „`Bash(*)` is equivalent to `Bash` … As a deny rule, both forms remove the
tool from Claude's context."
Quelle: <https://code.claude.com/docs/en/permissions>

Für die CLI-Flagge identisch formuliert: „`--disallowedTools` … A bare tool name
removes the matching tools from Claude's context: `"Edit"` removes Edit, `"*"`
removes every tool, and `"mcp__*"` removes every MCP tool."
Quelle: <https://code.claude.com/docs/en/cli-reference#cli-flags>

`permissions.deny` hat Scope `Any file` — steht also in jeder settings.json zur
Verfügung.
Quelle: <https://code.claude.com/docs/en/settings-reference#permissions-deny>

**Messung.** Mit `--settings '{"permissions":{"deny":["Artifact","ScheduleWakeup"]}}'`
verschwinden beide Namen aus dem `tools`-Feld der init-Nachricht; die Prompt-Token
fallen von 28.691 auf 22.922 (nur `Artifact` verweigert). Der praktische
Handgriff für die genannten Tools lautet also:

```json
{
  "permissions": {
    "deny": ["Artifact", "SendUserFile", "ReportFindings", "ScheduleWakeup", "Agent"]
  }
}
```

Einzige Ausnahme: `EndConversation`. „neither `--disallowedTools` nor a `--tools`
list can remove it", solange irgendein anderes Tool übrig bleibt.
Quelle: <https://code.claude.com/docs/en/tools-reference#endconversation-tool-behavior>

### (b) Ist `--tools` der einzige Mechanismus? Nein.

`--tools` „Restrict which built-in tools Claude can use. Use `""` to disable all,
`"default"` for all, or tool names like `"Bash,Edit,Read"`. The flag doesn't
affect MCP tools; to deny those too, use `--disallowedTools "mcp__*"`."
Quelle: <https://code.claude.com/docs/en/cli-reference#cli-flags>

Es ist eine Allowlist und damit bequemer, wenn man nur eine Handvoll Tools will —
aber nach (a) nicht der einzige Weg zum Entfernen des Schemas.

### (c) Lässt sich `--tools` aus settings.json / ENV / VS Code setzen?

Ein settings.json-Key namens `tools`, `disabledTools` oder `enabledTools`
**existiert nicht**. Der Key-Index der Settings-Referenz führt keinen dieser
Namen; die einzigen `tools`-nahen Keys sind `browserExternalPageTools` und
`disableMobileSimulatorTools`, beide Desktop-spezifisch.
Quelle: <https://code.claude.com/docs/en/settings-reference>

Eine Umgebungsvariable mit dieser Wirkung ist in der ENV-Referenz nicht gelistet.
Quelle: <https://code.claude.com/docs/en/env-vars>

Es gibt aber einen dokumentierten **indirekten** Weg über settings.json:

> `agent`: „Run the main thread as a named subagent, so Claude Code applies that
> subagent's system prompt, **tool restrictions**, and model to your session."
> Scope `Any file`.

Quelle: <https://code.claude.com/docs/en/settings-reference#agent>

Das `tools`-Frontmatter eines Subagenten wirkt wie eine Allowlist: „Tools the
subagent can use. Inherits every tool available to subagents if omitted."
Und: „**`disallowedTools` only**: the subagent gets every parent tool except the
listed ones."
Quellen: <https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields>,
<https://code.claude.com/docs/en/tools-reference#agent-tool-behavior>

Damit erreicht man aus reinen Settings-Dateien heraus eine `--tools`-äquivalente
Beschränkung, ohne Kommandozeilenflagge.

**VS Code:** Die Liste der Extension-Settings enthält keine Option für Toolsets
und keinen generischen CLI-Argument-Durchgriff — nur `environmentVariables` und
`claudeProcessWrapper` („Executable used to launch the Claude process. The
bundled binary path is passed as an argument when present.").
Quelle: <https://code.claude.com/docs/en/vs-code#extension-settings>
Ob sich über `claudeProcessWrapper` ein `--tools` einschleusen lässt, sagt die
Doku **nicht** — das wäre eine Schlussfolgerung, keine dokumentierte Zusage.
Der dokumentierte Weg unter VS Code ist stattdessen: die Extension teilt sich
`~/.claude/settings.json` mit der CLI („Claude Code settings in
`~/.claude/settings.json`: shared between the extension and CLI").
Quelle: <https://code.claude.com/docs/en/vs-code#configure-settings>

### Hat `Artifact` einen eigenen Abschaltschlüssel?

**Nein.** Der Key-Index der Settings-Referenz kennt keinen `disableArtifacts`
o. ä.; die Artifacts-Doku regelt über `Artifact`-bezogene Keys nur das
öffentliche Teilen auf Organisationsebene.
Quellen: <https://code.claude.com/docs/en/settings-reference>,
<https://code.claude.com/docs/en/artifacts>
Der Weg ist `permissions.deny: ["Artifact"]` wie oben.

---

## 4. claude.ai-Connectors: deferred, nicht injiziert

### Deferred Loading ist der Default

> „Tool search keeps MCP context usage low by **deferring tool definitions until
> Claude needs them. Only tool names and server instructions load at session
> start**, so adding more MCP servers has minimal impact on your context window."

Quelle: <https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search>

> „Tool search is enabled by default: MCP tools are deferred and discovered on
> demand."

Quelle: <https://code.claude.com/docs/en/mcp#configure-tool-search>

Die Kontextfenster-Seite führt den Posten entsprechend als „MCP tools
(deferred)": „MCP tool names listed so Claude knows what is available. By
default, full schemas stay deferred and Claude loads specific ones on demand via
tool search when a task needs them."
Quelle: <https://code.claude.com/docs/en/context-window>

Der Abrufmechanismus ist das `ToolSearch`-Tool; in der init-Nachricht dieser
Maschine ist `ToolSearch` im `tools`-Feld enthalten.

**Wichtige Einschränkungen, alle dokumentiert:**

* Deferred Loading braucht ein Modell mit `tool_reference`-Blöcken (Sonnet 4.5,
  Haiku 4.5, Opus 4.5 und neuer).
* Claude Code schaltet Tool Search ab, wenn `ANTHROPIC_BASE_URL` auf einen
  Nicht-Erstanbieter-Host zeigt; ebenso bei `ENABLE_TOOL_SEARCH=false` und auf
  Azure-gehosteten Microsoft-Foundry-Deployments (serverseitige Ablehnung).
* `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` hält Tool Search aus, ohne dass
  `ENABLE_TOOL_SEARCH` das überstimmen kann.
* `ENABLE_TOOL_SEARCH=auto` lädt Schemata vorab, solange sie unter 10 % des
  Kontextfensters bleiben; `false` lädt alles vorab.
* Ein einzelner Server kann sich über `alwaysLoad: true` in seiner Konfiguration
  ausnehmen — „Every tool from that server then loads into context at session
  start regardless of the `ENABLE_TOOL_SEARCH` setting."
* Tool-Beschreibungen und Server-Instructions werden bei je 2 KB abgeschnitten.

Quellen: <https://code.claude.com/docs/en/mcp#configure-tool-search>,
<https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search>,
<https://code.claude.com/docs/en/env-vars>

**Wichtig:** Die Doku unterscheidet an keiner Stelle zwischen claude.ai-Connectors
und anderen MCP-Servern, was Tool Search angeht. claude.ai-Connectors sind
MCP-Server und fallen unter dieselbe Regel — das ist eine **Schlussfolgerung**
aus dem Fehlen jeder Sonderregel, gestützt darauf, dass die Connector-Abschnitte
derselben Seite (`mcp.md`) angehören und nur Auth-, Precedence- und
Organisations-Sonderfälle nennen.
Quelle: <https://code.claude.com/docs/en/mcp#use-mcp-servers-from-claude-ai>

Ein dokumentierter Sonderfall auf Tool-Ebene: Setzt die Organisation ein
Connector-Tool auf `blocked`, dann „Claude Code filters the tool out before
Claude sees it, so it never appears in the tool list."
Quelle: <https://code.claude.com/docs/en/mcp#organization-controls-on-connector-tools>

Empirisch auf dieser Maschine listet `claude mcp list` acht Connectors
(TomTom Maps, Wolfram, Consensus, Booking.com, Spotify, Google Drive,
Google Calendar, Gmail), jeweils mit dem Präfix `claude.ai`. Die Baseline-Session
oben lief mit `--setting-sources ""` und leerem `mcp_servers`, taugt also nicht
als Vergleichsmessung für deren Kontextkosten.

### `disableClaudeAiConnectors`

> „Turn off claude.ai MCP connectors so Claude Code **neither fetches nor
> connects** them."

* **Scope**: `Any file` — jede settings.json-Ebene.
* **Semantik**: any-source-true. „A `true` in any settings file applies: a
  checked-in project `.claude/settings.json` can opt a repository out of cloud
  connectors, but a project-level `false` can't override a user- or
  managed-level `true`." Dieser Key gilt als Sicherheitsschlüssel und wird sogar
  gegen ein `false` aus Managed Settings gehalten.
* **Ab Version**: Claude Code v2.1.182.
* **Pro Session**: `ENABLE_CLAUDEAI_MCP_SERVERS=false`.
* **Ausnahme**: „Servers you pass explicitly with `--mcp-config` are unaffected."
  In Claude Code on the web greift der Key nicht, weil Connectors dort als
  explizite `--mcp-config`-Einträge vom Host kommen.

Quellen: <https://code.claude.com/docs/en/settings-reference#disableclaudeaiconnectors>,
<https://code.claude.com/docs/en/mcp#disable-claude-ai-connectors>,
<https://code.claude.com/docs/en/settings> (Abschnitt zu Ausnahmen von der
Managed-Settings-Präzedenz)

Für einzelne Connectors statt aller: `deniedMcpServers`.
Quelle: <https://code.claude.com/docs/en/settings-reference#deniedmcpservers>

---

## 5. `disable-model-invocation: true`

**Bestätigt, und die Doku ist hier ungewöhnlich explizit.**

Frontmatter-Referenz: „Set to `true` to prevent Claude from automatically loading
this skill. Use for workflows you want to trigger manually with `/name`. Also
prevents the skill from being preloaded into subagents. As of v2.1.196, also
prevents the skill from running when a scheduled task fires with the skill as its
prompt. Default: `false`."
Quelle: <https://code.claude.com/docs/en/skills#frontmatter-reference>

Zur Kontextwirkung, wörtlich:

> „**Hide individual skills** by adding `disable-model-invocation: true` to their
> frontmatter. **This removes the skill from Claude's context entirely.**"

Quelle: <https://code.claude.com/docs/en/skills#restrict-claudes-skill-access>

Die Vergleichstabelle der Invocation-Modi:

| Frontmatter | Du kannst aufrufen | Claude kann aufrufen | Kontext |
|:--|:--|:--|:--|
| `disable-model-invocation: true` | Ja | Nein | „Description not in context, full skill loads when you invoke" |

Quelle: <https://code.claude.com/docs/en/skills#control-who-invokes-a-skill>

Die Kontextfenster-Seite bestätigt es aus der Gegenrichtung: „Skills with
`disable-model-invocation: true` are not in this list. They stay completely out
of context until you invoke them with `/name`." Und zum Zeitpunkt des Aufrufs:
„Its description was not in the skill index at startup, so it cost zero context
until this moment. Now the full skill content loads."
Quelle: <https://code.claude.com/docs/en/context-window>

Nach `/compact` gilt eine Sonderregel: „Claude Code re-injects the body of each
skill you invoked, capped at 5,000 tokens per skill." Der Skill-Index selbst wird
nach `/compact` **nicht** neu injiziert — nur tatsächlich aufgerufene Skills
bleiben erhalten.
Quelle: <https://code.claude.com/docs/en/context-window>

Nicht verwechseln mit `user-invocable: false`: „With `user-invocable: false`, you
can't invoke the skill, but Claude still can."
Quelle: <https://code.claude.com/docs/en/skills#control-who-invokes-a-skill>

### Bestätigung in diesem Repository

`/home/hooti/Nextcloud/clientsync/Programming/Putzplan/.claude/skills/` enthält
27 Einträge (26 davon Symlinks nach `.agents/skills/` — `grep -r` ohne
`--dereference-recursive` übersieht sie). **16** davon tragen
`disable-model-invocation: true`, darunter `abnahme`, `handoff`, `implement`,
`triage`, `teach`, `wayfinder`.

Der Skill-Index dieser Session listet dem Modell genau **11** Projekt-Skills
(`code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`,
`grilling`, `prototype`, `research`, `resolving-merge-conflicts`, `tdd`,
`wizard`, `writing-for-agents`) plus einen Plugin-Skill. 27 − 16 = 11. Die
Rechnung geht exakt auf.

---

## Was sich aus Primärquellen NICHT klären ließ

1. **Token-Größe des `Workflow`-Tool-Schemas als publizierte Zahl.**
   DOKUMENTATION SCHWEIGT. Die Kontextfenster-Seite hat keinen Posten für
   Built-in-Tool-Schemata und weist ihre Zahlen ausdrücklich als
   „representative numbers" aus. Der hier genannte Wert (≈ 7.900 Token) ist eine
   eigene Differenzmessung auf Version 2.1.233 und kein dokumentierter Wert;
   dasselbe gilt für `Artifact` (≈ 5.770 Token) und `disableBundledSkills`
   (≈ 2.360 Token).

2. **Ob `/context` Tool-Definitionen als eigene Kategorie ausweist.**
   DOKUMENTATION SCHWEIGT. `/context` wird als „live breakdown by category"
   beschrieben, die Kategorien werden nicht aufgezählt.

3. **Ob claude.ai-Connectors dieselbe Tool-Search-Behandlung erfahren wie
   selbst konfigurierte MCP-Server.** Nirgends explizit gesagt. Meine
   Einordnung „ja" ist eine **Schlussfolgerung** aus dem Fehlen jeder
   gegenteiligen Regel auf der MCP-Seite.

4. **Ob sich `--tools` unter VS Code einschleusen lässt.**
   DOKUMENTATION SCHWEIGT. `claudeProcessWrapper` existiert und bekommt den
   Binary-Pfad als Argument, aber ein dokumentierter Argument-Durchgriff für
   CLI-Flaggen ist nicht beschrieben.

5. **Ob die vollständige Liste der Bundled Skills irgendwo als geschlossene
   Liste dokumentiert ist.** Die Skills-Doku nennt nur Beispiele („such as
   `/doctor`, `/code-review`, `/batch`, `/debug`, `/loop`, and `/claude-api`")
   und verweist auf die Commands-Referenz, wo Bundled Skills mit **Skill**
   markiert sind. Diese Markierung ist allerdings **nicht deckungsgleich** mit
   dem, was die CLI tatsächlich als Skill lädt: `/schedule` und `/update-config`
   erscheinen im `skills`-Feld der Laufzeit, tragen in der Commands-Referenz
   aber keinen **Skill**-Marker. Die hier angegebene 19er-Liste ist gemessen,
   nicht der Doku entnommen, und kann sich mit jeder Version ändern.

6. **Verhalten unter Amazon Bedrock, Google Cloud Agent Platform und Microsoft
   Foundry** wurde nicht empirisch geprüft; die genannten Einschränkungen sind
   rein der MCP-Doku entnommen.
