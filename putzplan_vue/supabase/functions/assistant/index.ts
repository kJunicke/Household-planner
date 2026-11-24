// Edge Function: Assistent
//
// Dünner Durchreicher zur Claude-API. Er prüft die Anmeldung, hängt
// Systemprompt, Werkzeuge und den API-Schlüssel an und gibt Claudes Antwort
// unverändert zurück. Die Werkzeuge AUSGEFÜHRT werden nicht hier, sondern im
// Client über die Stores (src/lib/assistant/) — so gilt dieselbe Logik wie in
// der Oberfläche, samt Offline-Warteschlange und Echtzeit-Abgleich.
//
// Der Schlüssel steht als Secret `ANTHROPIC_API_KEY` im Supabase-Projekt und
// verlässt diese Funktion nie.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODEL = 'claude-haiku-5-5'
const MAX_TOKENS = 1024
/** Obergrenzen gegen versehentlich teure Aufrufe. */
const MAX_MESSAGES = 40
const MAX_BODY_CHARS = 60_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/**
 * Was die Werkzeuge können, beschreibt Claude allein diese Liste. Name und
 * Felder müssen zu den Ausführern in src/lib/assistant/shoppingTools.ts passen.
 */
const TOOLS = [
  {
    name: 'add_shopping_items',
    description:
      'Setzt Artikel auf eine Einkaufsliste. Ein schon gekaufter Artikel gleichen Namens wird ' +
      'wieder geöffnet statt doppelt angelegt; ein schon offener bleibt, wie er ist.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: {
          type: 'string',
          description:
            'ID der Liste aus dem Kontext. Nennt der Nutzer keine und gibt es mehr als eine ' +
            'Liste, frag nach, statt eine zu wählen.',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Artikelname, kurz, im Singular wie auf einem Einkaufszettel',
              },
              quantity: { type: 'integer', minimum: 1, description: 'Menge, Standard 1' },
            },
            required: ['name'],
          },
        },
      },
      required: ['list_id', 'items'],
    },
  },
  {
    name: 'mark_shopping_items_purchased',
    description:
      'Hakt offene Artikel als gekauft ab. Auch für „Liste leeren“ — abgehakte Artikel ' +
      'lassen sich in der App zurückholen.',
    input_schema: {
      type: 'object',
      properties: {
        item_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'IDs offener Artikel aus dem Kontext. Passt der Name auf mehrere offene Artikel ' +
            'verschiedener Listen, frag nach, welcher gemeint ist.',
        },
      },
      required: ['item_ids'],
    },
  },
]

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
    let body: { messages?: unknown; lists?: unknown; today?: unknown }
    try {
      body = JSON.parse(raw) ?? {}
    } catch {
      return json(400, { error: 'Body is not valid JSON' })
    }
    const { messages, lists, today } = body
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return json(400, { error: `messages must hold 1 to ${MAX_MESSAGES} entries` })
    }
    if (!Array.isArray(lists) || !lists.every(isContextList)) {
      return json(400, { error: 'lists must be an array of { list_id, name, open_items }' })
    }
    if (typeof today !== 'string' || today.length > MAX_TODAY_CHARS) {
      return json(400, { error: `today must be a string of at most ${MAX_TODAY_CHARS} characters` })
    }

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
        tools: TOOLS,
        messages,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, data)
      return json(502, { error: data?.error?.message ?? 'Anthropic API error' })
    }

    // 4. Nur zurückgeben, was der Client braucht.
    return json(200, {
      content: data.content,
      stop_reason: data.stop_reason,
      usage: data.usage,
    })
  } catch (error) {
    console.error('assistant failed:', error)
    return json(500, { error: error instanceof Error ? error.message : String(error) })
  }
})
