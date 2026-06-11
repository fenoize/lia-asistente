import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const { verifyState, exchangeCodeForTokens } = await import("@/lib/google-calendar.server");

        const verified = state ? verifyState(state) : null;
        const origin = (verified?.origin as string | undefined) ?? url.origin;
        const settingsUrl = `${origin.replace(/\/$/, "")}/settings`;

        if (error) {
          return Response.redirect(`${settingsUrl}?google=error&reason=${encodeURIComponent(error)}`, 302);
        }
        if (!code || !verified) {
          return Response.redirect(`${settingsUrl}?google=error&reason=invalid_state`, 302);
        }

        const redirectUri = `${origin.replace(/\/$/, "")}/api/public/google/callback`;
        try {
          const tokens = await exchangeCodeForTokens(code, redirectUri);
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          await supabaseAdmin
            .from("user_integrations")
            .upsert(
              {
                user_id: verified.user_id as string,
                provider: "google_calendar",
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token ?? null,
                expires_at: expiresAt,
                scopes: tokens.scope,
                google_calendar_id: "primary",
                connected_at: new Date().toISOString(),
              },
              { onConflict: "user_id,provider" },
            );

          return Response.redirect(`${settingsUrl}?google=connected`, 302);
        } catch (err: any) {
          console.error("[google callback]", err?.message ?? err);
          return Response.redirect(`${settingsUrl}?google=error&reason=exchange_failed`, 302);
        }
      },
    },
  },
});
