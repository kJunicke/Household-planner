// Edge Function: Complete Task
// Replaces DB Trigger logic - updates both task_completions and tasks
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface CompleteTaskRequest {
  taskId: string
  effortOverride?: number
  overrideReason?: string
}

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  try {
    // 1. Parse request body
    const { taskId, effortOverride, overrideReason }: CompleteTaskRequest = await req.json()

    // 2. Validate input
    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'taskId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate: If effortOverride set, overrideReason must be provided
    if (effortOverride !== undefined && !overrideReason?.trim()) {
      return new Response(
        JSON.stringify({ error: 'effort_override requires override_reason' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Create authenticated Supabase client (uses user's JWT from Authorization header)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 4. Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Fetch task details (for parent_task_id check + assignment_permanent + task_type)
    const { data: taskDetails, error: fetchError } = await supabase
      .from('tasks')
      .select('effort, parent_task_id, assignment_permanent, task_type')
      .eq('task_id', taskId)
      .single()

    if (fetchError || !taskDetails) {
      console.error('Error fetching task details:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Task not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Calculate final effort based on SUBTASK-level subtask_points_mode (only for PARENT tasks with NO effortOverride)
    let finalEffort = taskDetails.effort // Default: use task's base effort
    let autoReason: string | undefined = undefined

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
        const completedSubtasks = subtasks.filter(s => s.completed)

        const checklistSubtasks = completedSubtasks.filter(s => s.subtask_points_mode === 'checklist')
        const deductSubtasks = completedSubtasks.filter(s => s.subtask_points_mode === 'deduct')
        const bonusSubtasks = completedSubtasks.filter(s => s.subtask_points_mode === 'bonus')

        const checklistCount = checklistSubtasks.length
        const deductSum = deductSubtasks.reduce((sum, s) => sum + s.effort, 0)
        const bonusSum = bonusSubtasks.reduce((sum, s) => sum + s.effort, 0)

        // Calculate final effort
        // Formula: parentEffort - deductSum + bonusSum
        // (checklist subtasks count 0, so they're ignored in calculation)
        finalEffort = taskDetails.effort - deductSum + bonusSum

        // VALIDATION: Prevent negative points
        if (finalEffort < 0) {
          return new Response(
            JSON.stringify({
              error: 'Nicht genug Punkte!',
              message: `Abziehen-Subtasks (${deductSum} Punkte) übersteigen Parent-Aufwand (${taskDetails.effort} Punkte). Bitte passe die Subtask-Aufwände oder den Parent-Aufwand an.`,
              details: {
                parentEffort: taskDetails.effort,
                deductSum,
                bonusSum,
                resultingEffort: finalEffort
              }
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Build auto-reason for tracking
        const reasonParts: string[] = []
        if (checklistCount > 0) reasonParts.push(`${checklistCount} Checkliste`)
        if (deductSum > 0) reasonParts.push(`${deductSum} abgezogen`)
        if (bonusSum > 0) reasonParts.push(`${bonusSum} Bonus`)

        if (reasonParts.length > 0) {
          autoReason = `Subtasks: ${reasonParts.join(', ')} → ${finalEffort} Punkte`
        }
      }
    }

    // 7. INSERT task_completion (RLS checks: task belongs to user's household + user_id matches auth)
    const completionData: {
      task_id: string
      user_id: string
      effort_override?: number
      override_reason?: string
    } = {
      task_id: taskId,
      user_id: user.id
    }

    // User override takes precedence over auto-calculation
    if (effortOverride !== undefined && overrideReason) {
      completionData.effort_override = effortOverride
      completionData.override_reason = overrideReason
    } else if (finalEffort !== taskDetails.effort && autoReason) {
      // Auto-calculated effort (from subtask_points_mode)
      completionData.effort_override = finalEffort
      completionData.override_reason = autoReason
    }

    const { error: completionError } = await supabase
      .from('task_completions')
      .insert(completionData)

    if (completionError) {
      console.error('Error creating completion:', completionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create completion', details: completionError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. UPDATE tasks (replaces trigger logic!)
    // Daily tasks: log completion + reset subtasks, but DON'T mark as completed (stay in Alltagsaufgaben tab)
    // Other tasks: mark as completed + update last_completed_at
    const now = new Date().toISOString()
    const updateData: {
      completed?: boolean
      last_completed_at: string
      assigned_to?: null
    } = {
      last_completed_at: now  // ← Always update timestamp
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

    const { error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('task_id', taskId)

    if (updateError) {
      console.error('Error updating task:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update task', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 9. Reset all subtasks to uncompleted (für saubere Punkteberechnung bei erneutem Putzen)
    // Wenn eine Parent Task completed wird, starten alle Subtasks "fresh"
    if (taskDetails.parent_task_id === null) {
      const { error: subtaskResetError } = await supabase
        .from('tasks')
        .update({ completed: false })
        .eq('parent_task_id', taskId)

      if (subtaskResetError) {
        console.error('Error resetting subtasks:', subtaskResetError)
        // Don't fail entire request - parent task completion was successful
        // Subtask reset is best-effort to avoid UX disruption
      }
    }

    // 10. Success!
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
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
    --header 'Content-Type': application/json' \
    --data '{"taskId":"some-uuid-here","effortOverride":5,"overrideReason":"War viel dreckiger als gedacht"}'

*/
