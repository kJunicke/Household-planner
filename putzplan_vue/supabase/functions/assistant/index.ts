// Edge Function: Assistent
//
// Dünner Durchreicher zur Claude-API. Er prüft die Anmeldung, hängt
// Systemprompt und API-Schlüssel an und gibt Claudes Antwort zurück. Die
// Werkzeuge sind im Client definiert und ausgeführt (src/lib/assistant/tools.ts,
// ein Modul je Bereich): der Client schickt ihre Beschreibungen mit, diese
// Funktion prüft nur Format, Anzahl und Größe und reicht sie weiter. So gilt
// dieselbe Logik wie in der Oberfläche, samt Offline-Warteschlange und
// Echtzeit-Abgleich.
//
// Der Schlüssel steht als Secret `ANTHROPIC_API_KEY` im Supabase-Projekt und
// verlässt diese Funktion nie.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODEL = 'claude-haiku-5-5'
const MAX_TOKENS = 1024
/** Obergrenzen gegen versehentlich teure Aufrufe. */
const MAX_MESSAGES = 40
const MAX_BODY_CHARS = 100_000
const MAX_TOOLS = 40
const MAX_TOOLS_CHARS = 40_000
const MAX_DESCRIPTION_CHARS = 2_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface ToolDefinition {
  name: string
  description: string
  input_schema: { type: 'object' }
}

/** Das Format der Messages API; mehr Felder (etwa `cache_control`) nimmt sie nicht vom Client. */
const isToolDefinition = (value: unknown): value is ToolDefinition => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const tool = value as Record<string, unknown>
  const schema = tool.input_schema as Record<string, unknown> | null
  return (
    Object.keys(tool).every((k) => k === 'name' || k === 'description' || k === 'input_schema') &&
    typeof tool.name === 'string' &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(tool.name) &&
    typeof tool.description === 'string' &&
    tool.description.length > 0 &&
    tool.description.length <= MAX_DESCRIPTION_CHARS &&
    typeof schema === 'object' &&
    schema !== null &&
    !Array.isArray(schema) &&
    schema.type === 'object'
  )
}

/** Die Übersicht, die der Client je Frage schickt (src/lib/assistant/overview.ts). */
const MAX_OVERVIEW_CHARS = 20_000

/** Fassung vor der Übersicht: Einkaufslisten mit ihren offenen Artikeln. */
interface ContextList {
  list_id: string
  name: string
  open_items: { id: string; name: string; quantity: number }[]
}

const MAX_TODAY_CHARS = 64

const isContextList = (value: unknown): value is ContextList => {
  const list = value as ContextList
  return (
    typeof list?.list_id === 'string' &&
    typeof list.name === 'string' &&
    Array.isArray(list.open_items) &&
    list.open_items.every(
      (i) =>
        typeof i?.id === 'string' && typeof i.name === 'string' && typeof i.quantity === 'number',
    )
  )
}

/** Der Stand, den ein Client der Fassung vor der Übersicht schickt, als Text. */
const describeContext = (lists: ContextList[]) => {
  if (lists.length === 0) return 'Der Haushalt hat noch keine Einkaufsliste.'
  return lists
    .map((list) => {
      const items = list.open_items.length
        ? list.open_items.map((i) => `  - ${i.name} ×${i.quantity} (id ${i.id})`).join('\n')
        : '  (keine offenen Artikel)'
      return `Liste „${list.name}“ (id ${list.list_id}):\n${items}`
    })
    .join('\n\n')
}

const legacyOverview = (lists: ContextList[], today: string) =>
  `Heute ist ${today}.\n\nEinkaufslisten mit offenen Artikeln:\n${describeContext(lists)}`

const systemPrompt = (overview: string) =>
  `Du bist der Assistent der Haushalts-App „Putzplan“. Du bedienst die App über Werkzeuge, ` +
  `mit denselben Mitteln wie man sie von Hand bedient, und immer als die Person, die fragt.

Regeln:
- Ist eindeutig, was gemeint ist, handle ohne Rückfrage.
- Ist nicht eindeutig, welche Liste, welcher Eintrag, welcher Betrag, welche Person oder welches Ziel gemeint ist, frag nach, statt zu raten.
- Nutze nur IDs aus der Übersicht unten oder aus Ergebnissen deiner Werkzeuge. Erfinde keine. Was nicht in der Übersicht steht, etwa was auf einer Liste steht, holst du dir mit einem Lese-Werkzeug.
- Die Übersicht unten wird vor jeder Frage neu erfasst: sie zeigt den Stand zu Beginn der neuesten Frage, nicht des Gesprächs. Was du in früheren Fragen dieses Gesprächs angelegt hast, steht deshalb schon darin, mit derselben ID wie in deinem Werkzeugergebnis. Das ist dein eigenes Anlegen, kein Zeichen, dass es vorher schon da war oder dass du etwas überschrieben hast; korrigiere dich deshalb nicht.
- Fragt jemand nach dem Stand („brauchen wir noch Butter“, „ist Milch drauf“, auch ohne Fragezeichen), lies nach, auf allen Listen, die passen können, und antworte; trag nichts ein.
- Findest du einen genannten Eintrag oder eine Kategorie auf der gelesenen Liste nicht, lies die übrigen Listen derselben Art, bevor du sagst, dass es sie nicht gibt; passt mehr als eine, frag nach.
- Fragt jemand, wie etwas in der App geht oder wo etwas liegt, ruf zuerst get_app_guide auf und antworte daraus in ein, zwei Sätzen. Biete dann an, hinzuführen; will er das, nutze go_to_page.
- Das tust du nie, auch nicht auf Bitte, denn es bleibt Sache des Haushalts: einen Ausgleich eintragen (auch Punkte ausgleichen und Verrechnen mit dem Haushaltstopf); Einstellungen ändern (Wochenziel, Richtwerte, Umrechnung, Haushalt, Mitglieder, Profil); Gastlinks anlegen, erneuern oder beenden. Sag in einem Satz, dass das von Hand geht und wo, und bring die App mit go_to_page gleich dorthin: Ausgleich und Umrechnung → kasse_ausgleich, Einstellungen und Gastlinks → einstellungen.
- Etwas für ein anderes Mitglied erledigen tust du nie, und du rätst auch nicht dazu, es an seiner Stelle abzuhaken: die Punkte gingen an den, der abhakt. Sag in einem Satz, dass das Mitglied es selbst abhakt.
- Aufgaben (anlegen, erledigen, was dran ist) und Töpfe (Ausgaben, Rückzahlungen, Salden) kannst du noch nicht. Sag das in einem Satz und bring die App hin: Aufgaben → putzen, Töpfe → topf mit der ID aus der Übersicht, sonst toepfe. Eine Ausgabe gehört in einen Topf, nicht in den Ausgleich.
- Kannst du etwas mit deinen Werkzeugen nicht, sag das in einem Satz.
- Steht vor einer Frage „(Inzwischen von mir zurückgenommen: …)“, hat der Nutzer diese Änderungen per Rückgängig aufgehoben: es gilt wieder der Stand davor, Gelöschtes ist wieder da, Angelegtes wieder weg. Erwähne das nur, wenn die Frage es betrifft.
- Antworte kurz, in der Sprache des Nutzers, und sag, was du in dieser Frage getan hast. Kommentiere frühere Antworten nicht, außer der Nutzer fragt danach, und behaupte nichts, was kein Werkzeugergebnis zeigt.
- Der Chat zeigt reinen Text: kein Markdown wie ** oder #; eine Aufzählung schreibst du als Zeilen mit „- “.

Übersicht des Haushalts:
${overview}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    // 1. Angemeldet? (verify_jwt prüft das Token schon; das hier holt den Nutzer.)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'Missing authorization header' })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    // Gäste (anonyme Anmeldung) bekommen den Assistenten nicht.
    if (userError || !user || user.is_anonymous) return json(401, { error: 'Unauthorized' })

    // 2. Anfrage prüfen
    const raw = await req.text()
    if (raw.length > MAX_BODY_CHARS) return json(413, { error: 'Request too large' })
    let body: {
      messages?: unknown
      overview?: unknown
      lists?: unknown
      today?: unknown
      tools?: unknown
    }
    try {
      body = JSON.parse(raw) ?? {}
    } catch {
      return json(400, { error: 'Body is not valid JSON' })
    }
    // Ein Client ohne `tools` (vor dem Werkzeug-Register) bekommt Claude ohne Werkzeuge.
    const { messages, tools = [] } = body
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return json(400, { error: `messages must hold 1 to ${MAX_MESSAGES} entries` })
    }
    // Ein Client vor der Übersicht schickt `lists` und `today` statt `overview`.
    let overview: string
    if (body.overview !== undefined) {
      if (typeof body.overview !== 'string' || body.overview.length > MAX_OVERVIEW_CHARS) {
        return json(400, {
          error: `overview must be a string of at most ${MAX_OVERVIEW_CHARS} characters`,
        })
      }
      overview = body.overview
    } else {
      const { lists, today } = body
      if (!Array.isArray(lists) || !lists.every(isContextList)) {
        return json(400, { error: 'lists must be an array of { list_id, name, open_items }' })
      }
      if (typeof today !== 'string' || today.length > MAX_TODAY_CHARS) {
        return json(400, {
          error: `today must be a string of at most ${MAX_TODAY_CHARS} characters`,
        })
      }
      overview = legacyOverview(lists, today)
    }
    if (!Array.isArray(tools) || tools.length > MAX_TOOLS || !tools.every(isToolDefinition)) {
      return json(400, {
        error: `tools must hold at most ${MAX_TOOLS} entries of { name, description, input_schema }`,
      })
    }
    if (JSON.stringify(tools).length > MAX_TOOLS_CHARS) {
      return json(413, { error: 'tools too large' })
    }
    const names = new Set(tools.map((t) => t.name))
    if (names.size !== tools.length) return json(400, { error: 'tool names must be unique' })

    // 3. Claude fragen
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY is not set' })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(overview),
        ...(tools.length ? { tools } : {}),
        messages,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, data)
      return json(502, { error: data?.error?.message ?? 'Anthropic API error' })
    }

    // 4. Nur zurückgeben, was der Client braucht.
    return json(200, { content: data.content, stop_reason: data.stop_reason })
  } catch (error) {
    console.error('assistant failed:', error)
    return json(500, { error: error instanceof Error ? error.message : String(error) })
  }
})
