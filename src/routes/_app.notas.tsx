import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/notas")({
  component: NotesPage,
});

const typeLabels: Record<string, string> = {
  note: "Nota",
  idea: "Idea",
  highlight: "Destacado",
};

function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [type, setType] = useState("note");

  const load = async () => {
    const { data } = await supabase.from("notes").select("*").order("created_at", { ascending: false });
    setNotes(data ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const save = async () => {
    if (!content.trim() || !user) return;
    const { error } = await supabase.from("notes").insert({ user_id: user.id, content, type });
    if (error) return toast.error(error.message);
    setContent("");
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("notes").delete().eq("id", id);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Notas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pensamientos sueltos, ideas, destacados.</p>
      </header>

      <div className="surface-1 hairline rounded-2xl p-4 mb-8">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escribe lo que tengas en mente…"
          rows={3}
          className="border-0 bg-transparent resize-none focus-visible:ring-0 px-0"
        />
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex gap-1">
            {Object.entries(typeLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setType(key)}
                className={`text-xs rounded-full px-2.5 py-1 transition ${
                  type === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button onClick={save} disabled={!content.trim()} className="rounded-[20px] h-9">Guardar</Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sin notas aún.</p>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {notes.map((n) => (
            <div key={n.id} className="break-inside-avoid surface-1 hairline rounded-xl p-4 group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{typeLabels[n.type] ?? n.type}</span>
                <button
                  onClick={() => remove(n.id)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-destructive transition"
                >
                  Eliminar
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{n.content}</p>
              <p className="mt-3 text-[10px] text-muted-foreground">
                {new Date(n.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
