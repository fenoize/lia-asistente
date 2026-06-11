import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string }) => data)
  .handler(async ({ data, context }) => {
    const { signState, GOOGLE_SCOPES, GOOGLE_OAUTH_AUTHORIZE } = await import("@/lib/google-calendar.server");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");

    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/google/callback`;
    const state = signState({ user_id: context.userId, origin: data.origin });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return { url: `${GOOGLE_OAUTH_AUTHORIZE}?${params.toString()}` };
  });

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_integrations")
      .select("provider, connected_at, scopes, google_calendar_id")
      .eq("user_id", context.userId)
      .eq("provider", "google_calendar")
      .maybeSingle();
    return { connected: !!data, info: data ?? null };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("user_integrations")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "google_calendar");
    return { ok: true };
  });
