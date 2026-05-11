import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/notes")({
  component: NotesPage,
});

type Note = {
  id: string;
  content: string;
  type: string | null;
  created_at: string | null;
};

type Tab = "all" | "note" | "idea" | "highlight";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "note", label: "Nota" },
  { id: "idea", label: "Idea" },
  { id: "highlight", label: "Highlight" },
];

function openCapture() {
  window.dispatchEvent(new CustomEvent("alfred:quick-capture"));
}

function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("notes")
        .select("*")
        .order("created_at", { ascending: false });
      setNotes((data as Note[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const filtered = useMemo(
    () => (tab === "all" ? notes : notes.filter((n) => (n.type ?? "note") === tab)),
    [notes, tab],
  );

  const remove = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
      <header className="flex items-center justify-between mb-6">
        <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          Notas
        </h1>
        <button
          onClick={openCapture}
          className="flex items-center gap-1.5"
          style={{
            fontSize: 12, padding: "6px 14px",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--accent-color)",
            color: "var(--accent-color)",
            background: "transparent",
          }}
        >
          <IconPlus size={14} /> Nueva
        </button>
      </header>

      <div className="flex gap-1.5 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 12, padding: "5px 12px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--border)",
              background: tab === t.id ? "var(--accent-subtle)" : "transparent",
              color: tab === t.id ? "var(--accent-color)" : "var(--text-secondary)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeletons />
      ) : filtered.length === 0 ? (
        <div className="text-center" style={{ padding: "80px 0" }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Aún no has guardado nada por aquí.</p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
            Tus ideas, highlights y notas vivirán acá.
          </p>
        </div>
      ) : (
        <div style={{ columnCount: 2, columnGap: 12 }}>
          {filtered.map((n) => (
            <NoteCard key={n.id} note={n} onRemove={() => remove(n.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onRemove }: { note: Note; onRemove: () => void }) {
  const type = (note.type ?? "note") as "note" | "idea" | "highlight";
  const tag: Record<string, { label: string; bg: string; color: string }> = {
    note: { label: "Nota", bg: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" },
    idea: { label: "Idea", bg: "var(--accent-subtle)", color: "var(--accent-color)" },
    highlight: { label: "Highlight", bg: "rgba(251,191,36,0.14)", color: "#fcd34d" },
  };
  const t = tag[type] ?? tag.note;
  const date = note.created_at
    ? new Date(note.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
    : "";

  return (
    <article
      className="group relative break-inside-avoid hover:[--note-border:var(--accent-subtle)]"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--note-border, var(--border))",
        borderRadius: "var(--radius-md)",
        padding: 16,
        marginBottom: 12,
        transition: "border-color 200ms ease",
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <span
          style={{
            fontSize: 11, padding: "2px 8px",
            borderRadius: "var(--radius-pill)",
            background: t.bg, color: t.color,
          }}
        >
          {t.label}
        </span>
        <button
          onClick={onRemove}
          aria-label="Eliminar"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-tertiary)" }}
        >
          <IconTrash size={14} />
        </button>
      </div>

      <p
        style={{
          fontSize: 14, lineHeight: 1.6,
          color: "var(--text-primary)",
          display: "-webkit-box",
          WebkitLineClamp: 6,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          whiteSpace: "pre-wrap",
        }}
      >
        {note.content}
      </p>

      <div className="flex justify-end mt-3">
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{date}</span>
      </div>
    </article>
  );
}

function Skeletons() {
  return (
    <div style={{ columnCount: 2, columnGap: 12 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="break-inside-avoid"
          style={{
            height: 100 + (i % 3) * 30,
            borderRadius: "var(--radius-md)",
            background: "var(--bg-elevated)", opacity: 0.5,
            marginBottom: 12,
            animation: "alfredShimmer 1.4s infinite",
          }}
        />
      ))}
    </div>
  );
}
