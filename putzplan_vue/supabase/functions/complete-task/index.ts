// Edge Function: Complete Task
// Replaces DB Trigger logic - updates both task_completions and tasks
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface CompleteTaskRequest {
  taskId: string
  effortOverride?: number
  completionNote?: string
  /**
   * Erstes Bewerten (CONTEXT.md § unbewertet): setzt die Standardpunkte einer
   * unbewerteten Aufgabe und erledigt sie im selben Aufruf. Pflicht, solange
   * die Aufgabe unbewertet ist; bei einer bewerteten abgelehnt.
   */
  standardPoints?: number
}

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Antwort mit JSON-Körper und CORS-Headern. */
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/**
 * Titel der Unteraufgabe, über die Projekt-Arbeit gebucht wird. Derselbe Titel
 * steht in `PROJECT_WORK_TITLE` in src/lib/taskPoints.ts.
 */
const PROJECT_WORK_TITLE = 'Am Projekt arbeiten'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  try {
    // 1. Parse request body
    const { taskId, effortOverride, completionNote, standardPoints }: CompleteTaskRequest =
      await req.json()

    // 2. Validate input
    if (!taskId) {
      return json(400, { error: 'taskId is required' })
    }

    // Punkte einer Erledigung: ganzzahlig 0–999. Dieselbe Grenze wie der CHECK
    // auf task_completions.effort_override (Migration 20261119120000) und
    // `isValidPoints(…, 'completion')` in src/lib/taskPoints.ts — wer eine
    // ändert, ändert alle drei. Hier geprüft, damit ein Tippfehler eine klare
    // 400 bekommt statt einer 500 aus dem Insert.
    if (
      effortOverride !== undefined &&
      !(Number.isInteger(effortOverride) && effortOverride >= 0 && effortOverride <= 999)
    ) {
      return json(400, { error: 'effortOverride must be an integer from 0 to 999' })
    }

    // Standardpunkte: ganzzahlig 1–999, wie der CHECK auf tasks.effort und
    // `isValidPoints(…, 'standard')` in src/lib/taskPoints.ts.
    if (
      standardPoints !== undefined &&
      !(Number.isInteger(standardPoints) && standardPoints >= 1 && standardPoints <= 999)
    ) {
      return json(400, { error: 'standardPoints must be an integer from 1 to 999' })
    }

    // Note: effortOverride and completionNote are both optional and independent
    // User can set custom effort WITHOUT a note, or add a note WITHOUT changing effort

    // 3. Create authenticated Supabase client (uses user's JWT from Authorization header)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(401, { error: 'Missing authorization header' })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    // 4. Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return json(401, { error: 'Unauthorized' })
    }

    // 5. Fetch task details (for parent_task_id check + assignment_permanent + task_type + subtask_points_mode,
    //    title for project work)
    const { data: taskDetails, error: fetchError } = await supabase
      .from('tasks')
      .select('title, effort, parent_task_id, assignment_permanent, task_type, subtask_points_mode')
      .eq('task_id', taskId)
      .single()

    if (fetchError || !taskDetails) {
      console.error('Error fetching task details:', fetchError)
      return json(404, { error: 'Task not found', details: fetchError?.message })
    }

    // Unbewertet (CONTEXT.md § unbewertet): ohne Standardpunkte wird nichts
    // erledigt — der Client öffnet vorher die Punktwahl und schickt den Wert als
    // `standardPoints` mit. Eine alte App-Version ohne diesen Parameter wird hier
    // abgewiesen. Umgekehrt ist `standardPoints` nur beim ersten Bewerten erlaubt;
    // eine bewertete Aufgabe ändert ihre Standardpunkte im Bearbeiten-Dialog.
    // Dieselbe Regel steht in `isUnrated` in src/lib/taskPoints.ts — wer eine
    // ändert, ändert beide.
    const isUnrated = taskDetails.effort === null
    if (isUnrated && standardPoints === undefined) {
      return json(400, { error: 'standardPoints is required: the task is unrated' })
    }
    if (!isUnrated && standardPoints !== undefined) {
      // Der Client hielt die Aufgabe für unbewertet, jemand anderes hat sie
      // inzwischen bewertet: die Meldung geht so in den Toast
      // (`code: 'already_rated'`, → taskStore.completeTask).
      return json(400, {
        error: 'Die Aufgabe wurde inzwischen bewertet — neu laden',
        code: 'already_rated',
      })
    }
    // Die Standardpunkte, mit denen ab hier gerechnet wird: die gespeicherten
    // oder die eben gewählten. Geschrieben werden sie mit dem Task-Update unten.
    const taskEffort = taskDetails.effort ?? (standardPoints as number)

    // 6. Fetch Parent Task Type wenn Subtask (für Daily-Validation)
    let parentTaskType: string | null = null
    if (taskDetails.parent_task_id !== null) {
      const { data: parentTask } = await supabase
        .from('tasks')
        .select('task_type')
        .eq('task_id', taskDetails.parent_task_id)
        .single()

      parentTaskType = parentTask?.task_type || null

      // Validation für Daily-Subtasks (sollten immer bonus sein)
      if (parentTaskType === 'daily' && taskDetails.subtask_points_mode !== 'bonus') {
        console.warn(
          `[Daily Task Validation] Subtask should be bonus mode!`,
          `Task: ${taskId}, Mode: ${taskDetails.subtask_points_mode}, Parent Type: ${parentTaskType}`,
        )
        // Optional: Force bonus behavior oder Error werfen für strikte Validation
        // return json(400, { error: 'Daily task subtasks must be bonus mode' })
      }
    }

    // Abweichung braucht Begründung (CONTEXT.md § Abweichung): wer andere Punkte
    // gibt als die Standardpunkte der Aufgabe, muss eine Notiz mitschicken.
    // Ausgenommen ist allein Projekt-Arbeit: die Unteraufgabe „Am Projekt
    // arbeiten“ eines Projekts. Das Projekt selbst und seine anderen
    // Unteraufgaben folgen der Regel wie jede Aufgabe. Quick-Aufgaben kommen nie
    // hierher (der Client schreibt sie direkt), und ohne Standardpunkte
    // (unbewertet) gibt es nichts, wovon man abwiche.
    // Dieselbe Regel steht in `isProjectWork` und `isDeviation` in
    // src/lib/taskPoints.ts — wer eine ändert, ändert beide.
    const isProjectWork = parentTaskType === 'project' && taskDetails.title === PROJECT_WORK_TITLE
    const hasNote = typeof completionNote === 'string' && completionNote.trim().length > 0
    if (
      effortOverride !== undefined &&
      !isProjectWork &&
      taskDetails.effort !== null &&
      effortOverride !== taskDetails.effort &&
      !hasNote
    ) {
      return json(400, {
        error: 'completionNote is required when effortOverride differs from the task effort',
      })
    }

    // 7. Handle CHECKLIST-MODE SUBTASKS: Award 0 points when completed individually
    // Checklist subtasks only matter for parent tracking, NOT for individual points
    if (taskDetails.parent_task_id !== null && taskDetails.subtask_points_mode === 'checklist') {
      // Force 0 points for checklist subtasks (unless user explicitly overrides)
      if (effortOverride === undefined) {
        const completionData = {
          task_id: taskId,
          user_id: user.id,
          effort_override: 0, // ALWAYS set (0 points for checklist subtasks)
          completion_note: completionNote || null, // Optional user note
        }

        const { error: completionError } = await supabase
          .from('task_completions')
          .insert(completionData)

        if (completionError) {
          console.error('Error creating completion:', completionError)
          return json(500, {
            error: 'Failed to create completion',
            details: completionError.message,
          })
        }

        // Mark subtask as completed (but award 0 points)
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            completed: true,
            last_completed_at: new Date().toISOString(),
            ...(isUnrated ? { effort: taskEffort } : {}),
          })
          .eq('task_id', taskId)

        if (updateError) {
          console.error('Error updating task:', updateError)
          return json(500, { error: 'Failed to update task', details: updateError.message })
        }

        return json(200, { success: true })
      }
    }

    // 7. Calculate final effort based on SUBTASK-level subtask_points_mode (only for PARENT tasks with NO effortOverride)
    let finalEffort = taskEffort // Default: use task's base effort

    // Only apply subtask points logic if:
    // - This is a PARENT task (parent_task_id === null)
    // - User did NOT provide effortOverride (user override takes precedence!)
    if (taskDetails.parent_task_id === null && effortOverride === undefined) {
      // Fetch ALL subtasks for this parent task (with their individual subtask_points_mode)
      const { data: subtasks, error: subtasksError } = await supabase
        .from('tasks')
        .select('task_id, effort, completed, subtask_points_mode')
        .eq('parent_task_id', taskId)

      if (subtasksError) {
        console.error('Error fetching subtasks:', subtasksError)
        // Don't fail entire request, just use default effort
      } else if (subtasks && subtasks.length > 0) {
        // Group completed subtasks by their individual points mode
        const completedSubtasks = subtasks.filter((s) => s.completed)
        const deductSubtasks = completedSubtasks.filter((s) => s.subtask_points_mode === 'deduct')

        // Calculate final effort
        // Formula: parentEffort - deductSum (minimum 0)
        // Bonus subtasks award points when completed individually, NOT at parent completion
        // Checklist subtasks count 0 (tracking only)
        // Eine unbewertete deduct-Unteraufgabe zieht nichts ab (wie
        // `estimateParentPoints` in src/lib/taskPoints.ts).
        const deductSum = deductSubtasks.reduce((sum, s) => sum + (s.effort ?? 0), 0)
        finalEffort = Math.max(0, taskEffort - deductSum)

        // Log warning if deduct sum exceeds parent effort (configuration issue)
        if (taskEffort - deductSum < 0) {
          console.warn(
            `[Deduct Overflow] Parent effort (${taskEffort}) exceeded by deduct subtasks (${deductSum}).`,
            `Task: ${taskId}, awarding 0 points for parent.`,
          )
        }

        // Note: autoReason was removed in Unified Effort System
        // effort_override is now ALWAYS set, making auto-generated reasons obsolete
        // Users can add optional completion_note if they want to document their work
      }
    }

    // 8. INSERT task_completion (RLS checks: task belongs to user's household + user_id matches auth)
    // UNIFIED SOLUTION: effort_override is ALWAYS set (Single Source of Truth for historical points)
    // This prevents historical data from changing when task.effort is modified later
    const finalEffortValue = effortOverride !== undefined ? effortOverride : finalEffort

    const completionData: {
      task_id: string
      user_id: string
      effort_override: number // ALWAYS set (even for standard completions)
      completion_note: string | null // Optional user note (independent of effort changes)
    } = {
      task_id: taskId,
      user_id: user.id,
      effort_override: finalEffortValue, // ← ALWAYS set for historical integrity
      completion_note: completionNote || null, // User can add optional note
    }

    const { error: completionError } = await supabase
      .from('task_completions')
      .insert(completionData)

    if (completionError) {
      console.error('Error creating completion:', completionError)
      return json(500, { error: 'Failed to create completion', details: completionError.message })
    }

    // 9. UPDATE tasks (replaces trigger logic!)
    // Daily tasks: log completion + reset subtasks, but DON'T mark as completed (stay in Alltagsaufgaben tab)
    // Other tasks: mark as completed + update last_completed_at
    const now = new Date().toISOString()
    const updateData: {
      completed?: boolean
      last_completed_at: string
      assigned_to?: null
      emphasis_level?: number
      effort?: number
    } = {
      last_completed_at: now, // ← Always update timestamp
    }

    // Erstes Bewerten: die gewählten Standardpunkte gelten ab jetzt.
    if (isUnrated) {
      updateData.effort = taskEffort
    }

    // Daily tasks stay uncompleted (always visible in Alltagsaufgaben tab)
    // Other task types (recurring, one-time) get marked as completed
    if (taskDetails.task_type !== 'daily') {
      updateData.completed = true
    }

    // Clear assignment if not permanent (using taskDetails.assignment_permanent fetched earlier)
    if (!taskDetails.assignment_permanent) {
      updateData.assigned_to = null
    }

    // Überstempeln gilt für EINEN Durchlauf (→ CONTEXT.md, "Überstempeln").
    // Zurückgesetzt wird beim Erledigen, sonst nie — auch bei täglichen Aufgaben.
    // Der bewusst gezahlte Preis: wer eine tägliche Aufgabe morgens auf DRINGEND
    // stempelt und sie mittags erledigt, verliert den Stapel sofort. Kein Fehler.
    //
    // Ausgenommen ist allein 'project': ein Projekt wird nie fertig, sein Stapel
    // bleibt stehen. (In der Praxis ist taskId hier ohnehin nie ein Projekt selbst
    // — Projekt-Arbeit läuft über den "Am Projekt arbeiten"-Subtask — aber die
    // Ausnahme steht trotzdem explizit da, statt sich auf diesen Nebeneffekt zu
    // verlassen.)
    //
    // Die Regel steht an ZWEI Stellen: hier und im Store (optimistischer Pfad).
    // Sie greift bewusst nach dem EIGENEN task_type, nicht nach dem Elternknoten.
    // Begründung im Glossar (CONTEXT.md, "Überstempeln"). Wer eine ändert, ändert
    // beide.
    if (taskDetails.task_type !== 'project') {
      updateData.emphasis_level = 0
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('task_id', taskId)

    if (updateError) {
      console.error('Error updating task:', updateError)
      return json(500, { error: 'Failed to update task', details: updateError.message })
    }

    // 10. Reset all subtasks to uncompleted (für saubere Punkteberechnung bei erneutem Putzen)
    // Wenn eine Parent Task completed wird, starten alle Subtasks "fresh"
    let subtaskResetWarning: string | null = null
    if (taskDetails.parent_task_id === null) {
      const { error: subtaskResetError } = await supabase
        .from('tasks')
        .update({ completed: false })
        .eq('parent_task_id', taskId)

      if (subtaskResetError) {
        console.error('Error resetting subtasks:', subtaskResetError)
        // Include warning in response - frontend should handle this
        // Future completions may have incorrect point calculations!
        subtaskResetWarning =
          'Subtasks konnten nicht zurückgesetzt werden. Nächste Completion könnte falsche Punkte berechnen.'
      }
    }

    // 11. Success (with optional warning)
    return json(200, {
      success: true,
      warning: subtaskResetWarning, // null if no issues, string if subtask reset failed
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return json(500, { error: 'Internal server error', details: (error as Error).message })
  }
})

/* To invoke locally:

  1. Run `npx supabase start`
  2. Make an HTTP request with user JWT:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"some-uuid-here"}'

  3. With effort override:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"some-uuid-here","effortOverride":7,"completionNote":"War viel dreckiger als gedacht"}'

  4. Out of range → 400 (0 is allowed, 1000 is not):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"some-uuid-here","effortOverride":1000}'

  5. Abweichung (task effort 3, override 5) without a note → 400:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"task-with-effort-3","effortOverride":5}'

  6. Same points as the task effort, without a note → 200:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"task-with-effort-3","effortOverride":3}'

  7. Project work (the project's "Am Projekt arbeiten" subtask) with other points and
     no note → 200 (the app itself always sends a note there). Any other subtask of a
     project, and the project row itself, needs a note like every task:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"project-work-subtask-uuid","effortOverride":8}'

  8. Unbewertete Aufgabe (tasks.effort NULL) ohne standardPoints → 400:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"unrated-task-uuid"}'

  9. Unbewertete Aufgabe mit standardPoints → 200, erledigt, tasks.effort = 5,
     effort_override = 5 (erstes Bewerten ist keine Abweichung):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"unrated-task-uuid","standardPoints":5}'

  10. standardPoints an einer bewerteten Aufgabe → 400 „wurde inzwischen bewertet — neu laden“
      (code already_rated):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/complete-task' \
    --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{"taskId":"task-with-effort-3","standardPoints":5}'

*/
