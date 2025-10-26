// Edge Function: Complete Task
// Replaces DB Trigger logic - updates both task_completions and tasks
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface CompleteTaskRequest {
  taskId: string
  effortOverride?: number
  overrideReason?: string
}

Deno.serve(async (req) => {
  try {
    // 1. Parse request body
    const { taskId, effortOverride, overrideReason }: CompleteTaskRequest = await req.json()

    // 2. Validate input
    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'taskId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate: If effortOverride set, overrideReason must be provided
    if (effortOverride !== undefined && !overrideReason?.trim()) {
      return new Response(
        JSON.stringify({ error: 'effort_override requires override_reason' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 3. Create authenticated Supabase client (uses user's JWT from Authorization header)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
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
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 5. INSERT task_completion (RLS checks: task belongs to user's household + user_id matches auth)
    const completionData: {
      task_id: string
      user_id: string
      effort_override?: number
      override_reason?: string
    } = {
      task_id: taskId,
      user_id: user.id
    }

    if (effortOverride !== undefined && overrideReason) {
      completionData.effort_override = effortOverride
      completionData.override_reason = overrideReason
    }

    const { error: completionError } = await supabase
      .from('task_completions')
      .insert(completionData)

    if (completionError) {
      console.error('Error creating completion:', completionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create completion', details: completionError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 6. UPDATE tasks.completed = TRUE + last_completed_at (replaces trigger logic!)
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        completed: true,
        last_completed_at: now  // ← This was previously done by trigger
      })
      .eq('task_id', taskId)

    if (updateError) {
      console.error('Error updating task:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update task', details: updateError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 7. Success!
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
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
