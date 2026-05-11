import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/recordatorios")({
  component: RemindersPage,
});

function RemindersPage() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from("reminders").select("*").order("datetime", { ascending: true });
    setReminders(data ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const toggle = async (r: any) => {
    await supabase.from("reminders").update({ done: !r.done }).eq("id", r.id);
    load();
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Recordatorios</h1>
        <p className="mt-1 text-sm text-muted-foreground">Para que no se te olvide.</p>
      </header>

      {reminders.length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">Nada por recordar. Usa ⌘K para agregar.</p>
      )}

      <div className="space-y-1">
        {reminders.map((r) => (
          <div
            key={r.id}
            className={cn("flex items-center gap-3 px-4 py-3 surface-1 hairline rounded-xl", r.done && "opacity-50")}
          >
            <Checkbox checked={r.done} onCheckedChange={() => toggle(r)} />
            <span className={cn("flex-1 text-sm", r.done && "line-through")}>{r.title}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {new Date(r.datetime).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
