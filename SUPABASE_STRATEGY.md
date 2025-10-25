# Supabase Architecture Strategy

**Kontext:** Putzplan App - Entscheidung über Backend-Architektur
**Datum:** 25. Oktober 2025

---

## 🎯 Die zentrale Frage

**Wo soll die Business-Logik leben?**

### Option 1: Database-First (Status Quo)
```
Frontend → Supabase Client → PostgreSQL (RLS Policies, Triggers, Functions)
                             ↑ Business-Logik HIER
```

### Option 2: Application-First (TypeScript Backend)
```
Frontend → API Layer (TypeScript) → Supabase (nur Storage)
           ↑ Business-Logik HIER
```

---

## 📊 DETAILLIERTER VERGLEICH

### Option 1: Database-First (RLS + Triggers)

#### ✅ Vorteile

**1. Performance**
- Logik läuft direkt in der DB (keine zusätzliche Hop)
- Atomic operations (Transactions sind native)
- Weniger Latency (kein API-Server dazwischen)

**2. Security**
- RLS ist Defense-in-Depth (auch wenn Frontend kompromittiert)
- Kann nicht umgangen werden (läuft vor jeder Query)
- Supabase Dashboard-Zugriffe sind auch geschützt

**3. Realtime**
- Supabase Realtime funktioniert out-of-the-box
- Change-Feeds automatisch für Clients
- Kein Custom WebSocket-Code

**4. Weniger Code**
- Kein API-Server zu maintainen
- Kein Deployment-Setup
- Weniger Boilerplate

**5. Cost**
- Nur Supabase bezahlen
- Kein separater Server (Heroku, Railway, etc.)
- Free Tier reicht länger

#### ❌ Nachteile

**1. Debugging Horror**
- SQL Policies sind schwer zu debuggen (kein `console.log`)
- Fehler sind kryptisch (`new row violates policy`)
- Keine Stack-Traces in Frontend

**2. Testing kompliziert**
- RLS-Tests müssen in DB laufen
- Kann nicht mit normalen Unit-Tests testen
- Mock-Setup sehr aufwändig

**3. Vendor Lock-in**
- Supabase-spezifische Features (RLS, Realtime)
- Migration zu anderer DB schwierig
- Supabase-Syntax-Eigenheiten

**4. Team-Skills**
- Team muss SQL können (nicht nur TypeScript)
- PostgreSQL-spezifisches Wissen nötig
- Junior-Devs haben oft Probleme

**5. Komplexe Logik wird unübersichtlich**
- Verschachtelte SQL-Functions
- Trigger-Chains schwer zu followen
- "Magic" passiert in DB (nicht im Code sichtbar)

**6. Keine Third-Party Integrations**
- Stripe, SendGrid, etc. brauchen API-Server
- Workarounds über Edge Functions

---

### Option 2: Application-First (TypeScript Backend)

#### ✅ Vorteile

**1. Debugging einfach**
```typescript
export async function completeTask(taskId: string, userId: string) {
  console.log('completeTask called:', { taskId, userId })  // ← SICHTBAR!

  const task = await getTask(taskId)
  console.log('Task loaded:', task)

  if (!task) throw new Error('Task not found')

  // Business-Logik HIER, lesbar!
  if (task.household_id !== user.household_id) {
    throw new Error('Not authorized')
  }

  await supabase.from('task_completions').insert({ task_id: taskId, user_id: userId })
  console.log('Completion created')
}
```

**2. Testing einfach**
```typescript
// tests/api/tasks.test.ts
it('completeTask validates household membership', async () => {
  const user = createTestUser()
  const task = createTestTask({ household_id: 'other-household' })

  await expect(completeTask(task.id, user.id)).rejects.toThrow('Not authorized')
})
```

**3. Bessere Developer Experience**
- TypeScript überall (einheitliche Sprache)
- IDE Auto-Complete funktioniert
- Stack-Traces durchgehend
- Breakpoints setzen möglich

**4. Third-Party Integrations easy**
```typescript
// api/webhooks/stripe.ts
export async function handlePayment(req: Request) {
  const payment = await stripe.webhooks.construct(req.body)
  await updateUserSubscription(payment.userId)
  await sendEmail(payment.email, 'Thanks for payment!')
}
```

**5. Flexibility**
- Business-Logik kann komplex werden ohne SQL-Hell
- State-Machines, Workflows, etc. easy
- Refactoring einfacher (TypeScript Compiler hilft)

**6. Team-Friendly**
- Junior-Devs kennen TypeScript
- Onboarding schneller
- Code-Reviews verständlicher

**7. Portability**
- Nicht Supabase-spezifisch
- Kann zu anderem DB-Provider migrieren
- Supabase ist nur Storage-Layer

#### ❌ Nachteile

**1. Mehr Infrastruktur**
- API-Server deployen (Railway, Fly.io, Vercel Functions)
- CI/CD Setup
- Environment-Management (Dev, Staging, Prod)

**2. Performance-Overhead**
```
Frontend → API (50ms) → Supabase (50ms) → Database
           ↑ Extra Hop!

vs.

Frontend → Supabase (50ms) → Database
```

**3. Security erfordert Disziplin**
- API muss Auth prüfen (nicht automatisch)
- Kann vergessen werden → Security-Lücke
- RLS ist zusätzliche Layer (Defense-in-Depth verloren)

**4. Realtime komplizierter**
- WebSockets selbst implementieren ODER
- Supabase Realtime + API-Hybrid (komplexer)

**5. Cost**
- API-Server Hosting
- Mehr Compute-Ressourcen
- Supabase + Server = 2x Infrastruktur

**6. Mehr Code**
- API-Routes schreiben
- Auth-Middleware
- Error-Handling
- Request-Validation
- ~30-40% mehr Code vs. Pure Supabase

---

## 🎭 KONKRETE BEISPIELE

### Beispiel 1: Task abschließen

#### Mit RLS (Database-First):
```sql
-- Migration: 20251018_task_completion_policy.sql
CREATE POLICY "Users can complete household tasks"
ON task_completions FOR INSERT
WITH CHECK (
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  )
  AND user_id = auth.uid()
);
```

**Frontend:**
```typescript
// Direkt Supabase-Client
const { error } = await supabase
  .from('task_completions')
  .insert({ task_id: taskId, user_id: user.id })

// RLS prüft automatisch - aber bei Fehler: kryptische Message
if (error) console.error(error)  // "new row violates policy"
```

#### Mit TypeScript API:
```typescript
// api/tasks/complete.ts
export async function completeTask(taskId: string, userId: string) {
  // 1. Validierung (klar lesbar!)
  const task = await supabase.from('tasks').select('*, household_id').eq('task_id', taskId).single()
  if (!task) throw new ApiError('Task not found', 404)

  const member = await supabase.from('household_members').select('*').eq('user_id', userId).single()
  if (!member) throw new ApiError('User not in household', 403)

  if (task.household_id !== member.household_id) {
    throw new ApiError('Task not in your household', 403)
  }

  // 2. Business-Logik
  if (task.completed) {
    throw new ApiError('Task already completed', 400)
  }

  // 3. DB-Update (Supabase nur als Storage!)
  const { error } = await supabase.from('task_completions').insert({
    task_id: taskId,
    user_id: userId,
    completed_at: new Date().toISOString()
  })

  if (error) throw new ApiError('Database error', 500, error)

  return { success: true }
}
```

**Frontend:**
```typescript
// Frontend ruft API statt Supabase direkt
try {
  await fetch('/api/tasks/complete', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
    headers: { 'Authorization': `Bearer ${session.token}` }
  })
} catch (error) {
  // Klare Error-Messages!
  toast.error(error.message)  // "Task not in your household"
}
```

**Vergleich:**
- **RLS:** 10 Zeilen SQL, aber kryptische Errors
- **TypeScript:** 40 Zeilen Code, aber klare Errors + testbar

---

### Beispiel 2: Stats berechnen

#### Mit Database Functions:
```sql
-- Function in DB
CREATE FUNCTION get_household_stats(household_uuid UUID)
RETURNS TABLE(user_id UUID, total_effort INT) AS $$
  SELECT
    tc.user_id,
    SUM(COALESCE(tc.effort_override, t.effort)) as total_effort
  FROM task_completions tc
  JOIN tasks t ON tc.task_id = t.task_id
  WHERE t.household_id = household_uuid
  GROUP BY tc.user_id
$$ LANGUAGE sql;
```

**Frontend:**
```typescript
const { data } = await supabase.rpc('get_household_stats', { household_uuid: id })
```

#### Mit TypeScript API:
```typescript
// api/stats/household.ts
export async function getHouseholdStats(householdId: string) {
  const completions = await supabase
    .from('task_completions')
    .select('user_id, effort_override, tasks(effort)')
    .eq('tasks.household_id', householdId)

  // Business-Logik in TypeScript!
  const statsByUser = new Map<string, number>()

  for (const comp of completions) {
    const effort = comp.effort_override ?? comp.tasks.effort
    const current = statsByUser.get(comp.user_id) || 0
    statsByUser.set(comp.user_id, current + effort)
  }

  return Array.from(statsByUser.entries()).map(([userId, effort]) => ({
    user_id: userId,
    total_effort: effort
  }))
}
```

**Vergleich:**
- **Database:** Performanter (SQL ist optimiert für Aggregations)
- **TypeScript:** Flexibler (kann leicht erweitert werden, z.B. Caching)

---

## 🎯 EMPFEHLUNG FÜR DEINE APP

### Aktuelle Situation:
- ✅ MVP läuft produktiv
- ✅ Realtime funktioniert
- ⚠️ 29 Migrations = Unübersichtlich
- ⚠️ Debugging schwierig
- ⚠️ Keine Tests

### Meine Empfehlung: **HYBRID-APPROACH** ⭐

**Nutze das Beste aus beiden Welten:**

```
┌─────────────────────────────────────┐
│         Frontend (Vue 3)            │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────────┐
│  Supabase   │  │  Edge Functions  │
│  (Direct)   │  │  (TypeScript)    │
│             │  │                  │
│ • Realtime  │  │ • completeTask() │
│ • Auth      │  │ • Stats calc     │
│ • Simple    │  │ • Validations    │
│   CRUD      │  │                  │
└─────────────┘  └──────────────────┘
       │                │
       └────────┬───────┘
                ▼
       ┌─────────────────┐
       │   Supabase DB   │
       │  (Storage only) │
       └─────────────────┘
```

### Aufteilung:

#### **Supabase Direct (behält RLS):**
- ✅ `tasks` - SELECT, INSERT, UPDATE (simple CRUD)
- ✅ `household_members` - SELECT, INSERT
- ✅ Realtime Subscriptions
- ✅ Auth (Supabase Auth)

**Warum:** Einfache Operationen, RLS reicht, Performance wichtig

#### **Edge Functions (TypeScript):**
- ✅ `completeTask()` - Validierung + Completion + Stats-Update
- ✅ `deleteCompletion()` - Audit-Log + Stats-Recalculation
- ✅ `calculateStats()` - Komplexe Aggregations
- ✅ `joinHousehold()` - Invite-Code Validation

**Warum:** Komplexe Logik, klare Errors, testbar

#### **Bleiben in DB:**
- ✅ `last_completed_at` Trigger (einfacher Trigger)
- ✅ `reset_recurring_tasks()` Cron (läuft eh in DB)

---

## 🚀 MIGRATIONS-PFAD

### Phase 1: Transparenz schaffen (2-3h)
**Ziel:** Übersicht ohne große Änderungen

1. **Dokumentation:**
   ```bash
   # Erstelle SECURITY_OVERVIEW.md
   # Liste alle aktiven Policies
   ```

2. **Konsolidierung:**
   ```bash
   # Erstelle supabase/rls_policies.sql
   # Alle 29 Migrations → 1 Datei
   ```

3. **Testing:**
   ```sql
   -- tests/rls_security.test.sql
   -- Test alle Policies
   ```

### Phase 2: Hybrid einführen (4-6h)
**Ziel:** Kritische Logik nach TypeScript

1. **Setup Edge Functions:**
   ```bash
   supabase functions new complete-task
   supabase functions new calculate-stats
   ```

2. **Migrate komplexe Logik:**
   - `completeTask()` → Edge Function
   - `fetchCompletions()` mit Stats → Edge Function
   - Simple CRUD bleibt direkt

3. **RLS vereinfachen:**
   - Policies für Edge Functions (Service-Role-Key)
   - Frontend behält RLS für Simple CRUD

### Phase 3: Cleanup (2h)
**Ziel:** Code-Qualität

1. **Alte Migrations archivieren:**
   ```
   supabase/migrations/archive/
   └── [alle 29 alten Migrations]

   supabase/migrations/
   └── 20251026_consolidated_schema.sql  ← Alles in einem
   ```

2. **Tests schreiben:**
   - Edge Functions testen (Deno.test)
   - RLS-Policies testen (SQL)

---

## 📊 DECISION MATRIX

| Kriterium | Database-First | Application-First | Hybrid | Gewichtung |
|-----------|----------------|-------------------|--------|------------|
| **Debugging** | ❌ 2/10 | ✅ 9/10 | ✅ 8/10 | HIGH |
| **Performance** | ✅ 10/10 | ⚠️ 7/10 | ✅ 9/10 | MEDIUM |
| **Testing** | ❌ 3/10 | ✅ 9/10 | ✅ 8/10 | HIGH |
| **Security** | ✅ 10/10 | ⚠️ 7/10 | ✅ 9/10 | CRITICAL |
| **Cost** | ✅ 10/10 | ❌ 6/10 | ⚠️ 8/10 | MEDIUM |
| **DX** | ❌ 4/10 | ✅ 9/10 | ✅ 8/10 | HIGH |
| **Realtime** | ✅ 10/10 | ❌ 5/10 | ✅ 9/10 | HIGH |
| **Flexibility** | ⚠️ 6/10 | ✅ 10/10 | ✅ 9/10 | MEDIUM |
| **Team Skills** | ❌ 5/10 | ✅ 9/10 | ✅ 8/10 | HIGH |
| **Vendor Lock-in** | ❌ 3/10 | ✅ 8/10 | ⚠️ 6/10 | LOW |

### Weighted Score:
- **Database-First:** 5.9/10
- **Application-First:** 7.8/10
- **Hybrid:** **8.4/10** ⭐ WINNER

---

## 💡 KONKRETE NEXT STEPS

### Wenn du Hybrid willst (EMPFOHLEN):

```bash
# 1. Edge Function Setup (15 min)
cd putzplan_vue
supabase functions new complete-task

# 2. Erste Function schreiben (1h)
# supabase/functions/complete-task/index.ts
# - Auth prüfen
# - Task validieren
# - Completion erstellen
# - Klar lesbar!

# 3. Frontend umstellen (30 min)
# Statt: supabase.from('task_completions').insert()
# Jetzt: supabase.functions.invoke('complete-task', { body: { taskId } })

# 4. Testen (30 min)
npm run dev
# Debugging mit console.log möglich!

# 5. Deploy (5 min)
supabase functions deploy complete-task
```

**Total Time:** ~3 Stunden für ersten Proof-of-Concept

### Wenn du Pure TypeScript Backend willst:

```bash
# 1. Express Setup (1h)
mkdir backend
cd backend
npm init -y
npm install express @supabase/supabase-js

# 2. API Routes (2-3h)
# routes/tasks.ts - alle Task-Operationen
# routes/stats.ts - Stats-Berechnung

# 3. Frontend umstellen (2h)
# Alle supabase.from() Calls → fetch('/api/...')

# 4. Deploy (1h)
# Railway/Fly.io/Render setup
```

**Total Time:** ~6-7 Stunden für Basic-Setup

---

## 🎯 FAZIT

### Für DEINE App (Putzplan):

**Hybrid-Approach ist optimal weil:**

✅ **Behält Supabase-Vorteile:**
- Realtime funktioniert weiter
- Auth bleibt simpel
- Simple CRUD schnell
- Günstig (kein separater Server-Hosting)

✅ **Löst deine Probleme:**
- Komplexe Logik in TypeScript → debuggable
- Tests schreibbar
- Klare Error-Messages
- Transparenter Code

✅ **Minimaler Aufwand:**
- Nur kritische Teile migrieren
- Rest bleibt wie ist
- ~3 Stunden für erste Migration

❌ **Pure TypeScript Backend nur wenn:**
- Du Payment/Email/Complex-Workflows brauchst (noch nicht!)
- Team kann kein SQL (ist bei dir solo nicht relevant)
- Vendor Lock-in kritisch (bei MVP egal)

---

## 📝 ACTION ITEMS

**Soll ich dir helfen mit:**

1. **Hybrid-Setup starten?**
   - Erste Edge Function schreiben (`complete-task`)
   - Frontend umstellen
   - Debugging zeigen

2. **Erst Transparenz schaffen?**
   - `SECURITY_OVERVIEW.md` generieren
   - Alle Policies dokumentieren
   - Dann entscheiden

3. **Pure Backend evaluieren?**
   - Express Boilerplate zeigen
   - Migration-Plan erstellen
   - Aufwand abschätzen

**Was bevorzugst du?**

---

**Meine Empfehlung:** Starte mit **Option 1 (Hybrid)** - erste Edge Function für `completeTask()`.

Dann siehst du sofort:
- ✅ TypeScript Debugging mit `console.log`
- ✅ Klare Error-Messages
- ✅ Testbar
- ✅ Realtime funktioniert weiter
- ✅ Minimale Migration (~3h)

Danach kannst du entscheiden ob du mehr migrieren willst oder mit Hybrid glücklich bist.
