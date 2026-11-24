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

/** Der aktuelle Stand, den der Client mitschickt, als Text für den Systemprompt. */
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

const systemPrompt = (lists: ContextList[], today: string) =>
  `Du bist der Assistent einer Haushalts-App für zwei Personen. Du bedienst die App über ` +
  `Werkzeuge. Heute ist ${today}.

Regeln:
- Ist eindeutig, was gemeint ist, handle ohne Rückfrage.
- Ist nicht eindeutig, welche Liste oder welcher Artikel gemeint ist, frag nach, statt zu raten.
- Nutze nur IDs aus dem Stand unten. Erfinde keine.
- Antworte kurz, in der Sprache des Nutzers, und sag, was du getan hast.
- Kannst du etwas mit deinen Werkzeugen nicht, sag das in einem Satz.

Aktueller Stand der Einkaufslisten:
${describeContext(lists)}`

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
    let body: { messages?: unknown; lists?: unknown; today?: unknown; tools?: unknown }
    try {
      body = JSON.parse(raw) ?? {}
    } catch {
      return json(400, { error: 'Body is not valid JSON' })
    }
    // Ein Client ohne `tools` (vor dem Werkzeug-Register) bekommt Claude ohne Werkzeuge.
    const { messages, lists, today, tools = [] } = body
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return json(400, { error: `messages must hold 1 to ${MAX_MESSAGES} entries` })
    }
    if (!Array.isArray(lists) || !lists.every(isContextList)) {
      return json(400, { error: 'lists must be an array of { list_id, name, open_items }' })
    }
    if (typeof today !== 'string' || today.length > MAX_TODAY_CHARS) {
      return json(400, { error: `today must be a string of at most ${MAX_TODAY_CHARS} characters` })
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
        system: systemPrompt(lists, today),
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
