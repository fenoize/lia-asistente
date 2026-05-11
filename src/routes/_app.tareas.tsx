import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tareas")({
  component: TasksPage,
});

const priorities = ["low", "medium", "high"] as const;
const priorityLabels: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta" };

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState("");

  const load = async () => {
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTasks(data ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !user) return;
    const { error } = await supabase.from("tasks").insert({ user_id: user.id, title });
    if (error) return toast.error(error.message);
    setTitle("");
    load();
  };

  const toggle = async (t: any) => {
    const status = t.status === "done" ? "pending" : "done";
    await supabase.from("tasks").update({ status }).eq("id", t.id);
    load();
  };

  const setPriority = async (t: any, priority: string) => {
    await supabase.from("tasks").update({ priority }).eq("id", t.id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    load();
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Tareas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Lo que tienes que hacer.</p>
      </header>

      <form onSubmit={add} className="flex gap-2 mb-6">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nueva tarea…"
          className="rounded-lg"
        />
        <Button type="submit" disabled={!title.trim()} className="rounded-[20px] shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Agregar
        </Button>
      </form>

      <div className="space-y-1">
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground py-12 text-center">Nada por aquí. Agrega tu primera tarea.</p>
        )}
        {tasks.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-center gap-3 px-4 py-3 surface-1 hairline rounded-xl",
              t.status === "done" && "opacity-50"
            )}
          >
            <Checkbox checked={t.status === "done"} onCheckedChange={() => toggle(t)} />
            <span className={cn("flex-1 text-sm", t.status === "done" && "line-through")}>{t.title}</span>
            <select
              value={t.priority}
              onChange={(e) => setPriority(t, e.target.value)}
              className="text-xs bg-transparent border border-border rounded-full px-2 py-0.5 text-muted-foreground"
            >
              {priorities.map((p) => (
                <option key={p} value={p}>{priorityLabels[p]}</option>
              ))}
            </select>
            {t.due_date && (
              <span className="text-xs text-muted-foreground">
                {new Date(t.due_date).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
              </span>
            )}
            <button
              onClick={() => remove(t.id)}
              className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive transition"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
