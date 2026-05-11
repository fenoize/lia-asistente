import { useEffect, useState } from "react";
import { Plus, Sparkles, CheckSquare, Calendar, Bell, NotebookPen, ArrowRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Classification = {
  type: "task" | "meeting" | "reminder" | "note";
  title: string;
  description?: string | null;
  datetime?: string | null;
  priority?: "low" | "medium" | "high" | null;
  duration_minutes?: number | null;
};

const typeMeta = {
  task: { label: "Tarea", icon: CheckSquare },
  meeting: { label: "Reunión", icon: Calendar },
  reminder: { label: "Recordatorio", icon: Bell },
  note: { label: "Nota", icon: NotebookPen },
} as const;

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Classification | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const reset = () => {
    setText("");
    setDraft(null);
  };

  const classify = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/quick-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Classification;
      setDraft(data);
    } catch (e: any) {
      toast.error("Alfred no pudo entender eso. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!draft || !user) return;
    setBusy(true);
    try {
      if (draft.type === "task") {
        await supabase.from("tasks").insert({
          user_id: user.id,
          title: draft.title,
          description: draft.description ?? null,
          priority: draft.priority ?? "medium",
          due_date: draft.datetime ?? null,
        });
      } else if (draft.type === "meeting") {
        await supabase.from("meetings").insert({
          user_id: user.id,
          title: draft.title,
          datetime: draft.datetime ?? new Date().toISOString(),
          duration_minutes: draft.duration_minutes ?? 60,
          notes: draft.description ?? null,
        });
      } else if (draft.type === "reminder") {
        await supabase.from("reminders").insert({
          user_id: user.id,
          title: draft.title,
          datetime: draft.datetime ?? new Date().toISOString(),
        });
      } else {
        await supabase.from("notes").insert({
          user_id: user.id,
          content: draft.description || draft.title,
          type: "note",
        });
      }
      toast.success("Listo.");
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground",
          "flex items-center justify-center transition hover:scale-105 glow-purple"
        )}
        aria-label="Captura rápida"
      >
        <Plus className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="surface-1 border-border max-w-xl rounded-2xl p-0 gap-0">
          {!draft ? (
            <div className="p-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <Sparkles className="h-3.5 w-3.5" />
                Captura rápida
                <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘K</kbd>
              </div>
              <Textarea
                autoFocus
                placeholder="Escribe lo que sea. Yo decido si es tarea, reunión, recordatorio o nota."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") classify();
                }}
                rows={4}
                className="border-0 bg-transparent text-base resize-none focus-visible:ring-0 px-0"
              />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">⌘ + Enter para procesar</span>
                <Button onClick={classify} disabled={busy || !text.trim()} className="rounded-[20px] h-9">
                  {busy ? "Pensando…" : "Procesar"}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <DraftPreview
              draft={draft}
              busy={busy}
              onCancel={reset}
              onConfirm={confirm}
              onEdit={(d) => setDraft(d)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DraftPreview({
  draft, busy, onCancel, onConfirm, onEdit,
}: {
  draft: Classification;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onEdit: (d: Classification) => void;
}) {
  const meta = typeMeta[draft.type];
  const Icon = meta.icon;
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
        <Sparkles className="h-3.5 w-3.5" />
        Alfred lo clasificó como
        <span className="inline-flex items-center gap-1 ml-1 rounded-full bg-primary/15 text-primary px-2 py-0.5">
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      <input
        value={draft.title}
        onChange={(e) => onEdit({ ...draft, title: e.target.value })}
        className="w-full bg-transparent text-lg font-medium focus:outline-none"
      />

      {draft.datetime && (
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(draft.datetime).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
      {draft.description && (
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{draft.description}</p>
      )}
      {draft.priority && draft.type === "task" && (
        <span className="inline-block mt-3 text-xs text-muted-foreground">
          Prioridad: <span className="text-foreground capitalize">{draft.priority}</span>
        </span>
      )}

      <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onCancel} className="rounded-[20px] h-9">
          Volver
        </Button>
        <Button onClick={onConfirm} disabled={busy} className="rounded-[20px] h-9">
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
