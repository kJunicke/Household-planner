// Edge Function: Complete Task
// Replaces DB Trigger logic - updates both task_completions and tasks
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface CompleteTaskRequest {
  taskId: string
  effortOverride?: number
  completionNote?: string
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
    const { taskId, effortOverride, completionNote }: CompleteTaskRequest = await req.json()

    // 2. Validate input
    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'taskId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Note: effortOverride and completionNote are both optional and independent
    // User can set custom effort WITHOUT a note, or add a note WITHOUT changing effort

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

    // 5. Fetch task details (for parent_task_id check + assignment_permanent + task_type + subtask_points_mode)
    const { data: taskDetails, error: fetchError } = await supabase
      .from('tasks')
      .select('effort, parent_task_id, assignment_permanent, task_type, subtask_points_mode')
      .eq('task_id', taskId)
      .single()

    if (fetchError || !taskDetails) {
      console.error('Error fetching task details:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Task not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
          `Task: ${taskId}, Mode: ${taskDetails.subtask_points_mode}, Parent Type: ${parentTaskType}`
        )
        // Optional: Force bonus behavior oder Error werfen für strikte Validation
        // return new Response(JSON.stringify({ error: 'Daily task subtasks must be bonus mode' }), ...)
      }
    }

    // 7. Handle CHECKLIST-MODE SUBTASKS: Award 0 points when completed individually
    // Checklist subtasks only matter for parent tracking, NOT for individual points
    if (taskDetails.parent_task_id !== null && taskDetails.subtask_points_mode === 'checklist') {
      // Force 0 points for checklist subtasks (unless user explicitly overrides)
      if (effortOverride === undefined) {
        const completionData = {
          task_id: taskId,
          user_id: user.id,
          effort_override: 0,  // ALWAYS set (0 points for checklist subtasks)
          completion_note: completionNote || null  // Optional user note
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

        // Mark subtask as completed (but award 0 points)
        const { error: updateError } = await supabase
          .from('tasks')
          .update({ completed: true, last_completed_at: new Date().toISOString() })
          .eq('task_id', taskId)

        if (updateError) {
          console.error('Error updating task:', updateError)
          return new Response(
            JSON.stringify({ error: 'Failed to update task', details: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 7. Calculate final effort based on SUBTASK-level subtask_points_mode (only for PARENT tasks with NO effortOverride)
    let finalEffort = taskDetails.effort // Default: use task's base effort

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
        const deductSubtasks = completedSubtasks.filter(s => s.subtask_points_mode === 'deduct')

        // Calculate final effort
        // Formula: parentEffort - deductSum (minimum 0)
        // Bonus subtasks award points when completed individually, NOT at parent completion
        // Checklist subtasks count 0 (tracking only)
        const deductSum = deductSubtasks.reduce((sum, s) => sum + s.effort, 0)
        finalEffort = Math.max(0, taskDetails.effort - deductSum)

        // Log warning if deduct sum exceeds parent effort (configuration issue)
        if (taskDetails.effort - deductSum < 0) {
          console.warn(
            `[Deduct Overflow] Parent effort (${taskDetails.effort}) exceeded by deduct subtasks (${deductSum}).`,
            `Task: ${taskId}, awarding 0 points for parent.`
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
      effort_override: number  // ALWAYS set (even for standard completions)
      completion_note: string | null  // Optional user note (independent of effort changes)
    } = {
      task_id: taskId,
      user_id: user.id,
      effort_override: finalEffortValue,  // ← ALWAYS set for historical integrity
      completion_note: completionNote || null  // User can add optional note
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

    // 9. UPDATE tasks (replaces trigger logic!)
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
        subtaskResetWarning = 'Subtasks konnten nicht zurückgesetzt werden. Nächste Completion könnte falsche Punkte berechnen.'
      }
    }

    // 11. Success (with optional warning)
    return new Response(
      JSON.stringify({
        success: true,
        warning: subtaskResetWarning  // null if no issues, string if subtask reset failed
      }),
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
