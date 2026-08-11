// Scheduled entry point for the Task Follow-Up Engine.
// Called by pg_cron (or any external scheduler) with the project apikey header.
// Also accepts { userId } to run the engine for a single user.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/task-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace("Bearer ", "") ??
          "";
        const expected =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
        if (!expected || apiKey !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: { userId?: string } = {};
        try {
          body = (await request.json()) as { userId?: string };
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runFollowUpsForAllUsers, runFollowUpsForUser } = await import(
          "@/lib/followup/runner.server"
        );

        const now = new Date();
        const results = body.userId
          ? [await runFollowUpsForUser(supabaseAdmin, body.userId, now)]
          : await runFollowUpsForAllUsers(supabaseAdmin, now);

        return Response.json({
          ok: true,
          users: results.length,
          created: results.reduce((sum, r) => sum + r.created, 0),
        });
      },
    },
  },
});
