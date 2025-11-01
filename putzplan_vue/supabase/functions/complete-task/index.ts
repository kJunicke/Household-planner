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

    // 5. Fetch task details (for subtask_points_mode + parent_task_id check)
    const { data: taskDetails, error: fetchError } = await supabase
      .from('tasks')
      .select('effort, parent_task_id, subtask_points_mode, assignment_permanent')
      .eq('task_id', taskId)
      .single()

    if (fetchError || !taskDetails) {
      console.error('Error fetching task details:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Task not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Calculate final effort based on subtask_points_mode (only for PARENT tasks with NO effortOverride)
    let finalEffort = taskDetails.effort // Default: use task's base effort
    let autoReason: string | undefined = undefined

    // Only apply subtask_points_mode logic if:
    // - This is a PARENT task (parent_task_id === null)
    // - User did NOT provide effortOverride (user override takes precedence!)
    if (taskDetails.parent_task_id === null && effortOverride === undefined) {
      const mode = taskDetails.subtask_points_mode as 'checklist' | 'deduct' | 'bonus' | null

      if (mode === 'deduct' || mode === 'checklist') {
        // Fetch ALL subtasks for this parent task
        const { data: subtasks, error: subtasksError } = await supabase
          .from('tasks')
          .select('task_id, effort, completed')
          .eq('parent_task_id', taskId)

        if (subtasksError) {
          console.error('Error fetching subtasks:', subtasksError)
          // Don't fail entire request, just use default effort
        } else if (subtasks && subtasks.length > 0) {
          if (mode === 'checklist') {
            // Checklist mode: Subtasks count 0 points, only parent gives points
            // NO change to finalEffort (already set to taskDetails.effort)
            autoReason = 'Checklist Mode: Subtasks zählen nicht'
          } else if (mode === 'deduct') {
            // Deduct mode: Subtract completed subtask efforts from parent effort
            const completedSubtaskEffortSum = subtasks
              .filter(s => s.completed)
              .reduce((sum, s) => sum + s.effort, 0)

            finalEffort = Math.max(0, taskDetails.effort - completedSubtaskEffortSum)

            if (completedSubtaskEffortSum > 0) {
              autoReason = `Deduct Mode: ${taskDetails.effort} - ${completedSubtaskEffortSum} Subtask-Punkte = ${finalEffort}`
            }
          }
        }
      }
      // mode === 'bonus': Subtasks count separately (handled via separate completions) - NO change to parent effort
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

    // 8. UPDATE tasks.completed = TRUE + last_completed_at (replaces trigger logic!)
    // If assignment is NOT permanent, clear assigned_to on completion
    const now = new Date().toISOString()
    const updateData: {
      completed: boolean
      last_completed_at: string
      assigned_to?: null
    } = {
      completed: true,
      last_completed_at: now  // ← This was previously done by trigger
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

    // 9. Success!
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
    --header 'Content-Type: application/json' \
    --data '{"taskId":"some-uuid-here","effortOverride":5,"overrideReason":"War viel dreckiger als gedacht"}'

*/
