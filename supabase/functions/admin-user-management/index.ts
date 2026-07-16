import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'diegoulloag@gmail.com'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await callerClient.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    if (req.method === 'POST' && action === 'invite') {
      const { email, name } = await req.json()
      if (!email) return new Response(JSON.stringify({ error: 'Email requerido' }), { status: 400, headers: jsonHeaders })
      const { error } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { name: name ?? '' } })
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: jsonHeaders })
      return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders })
    }

    if (req.method === 'POST' && action === 'delete') {
      const { userId } = await req.json()
      if (!userId) return new Response(JSON.stringify({ error: 'userId requerido' }), { status: 400, headers: jsonHeaders })
      const { error } = await adminClient.auth.admin.deleteUser(userId)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: jsonHeaders })
      return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: jsonHeaders })
  }
})
