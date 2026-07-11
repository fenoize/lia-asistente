import { createFileRoute } from "@tanstack/react-router";
import { stripMentionSyntaxLoose } from "@/lib/mentions";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconTrash, IconCheck, IconX, IconPencil, IconSearch } from "@tabler/icons-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/notes")({
  component: NotesPage,
});

type Note = {
  id: string;
  title: string | null;
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
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tab === "all" ? notes : notes.filter((n) => (n.type ?? "note") === tab);
    if (q) {
      list = list.filter(
        (n) =>
          (n.title ?? "").toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q),
      );
    }
    return list;
  }, [notes, tab, query]);

  const remove = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const updateNote = async (
    id: string,
    patch: { content?: string; type?: string; title?: string | null },
  ) => {
    const prev = notes;
    setNotes((curr) => curr.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    const { error } = await supabase.from("notes").update(patch).eq("id", id);
    if (error) {
      setNotes(prev);
      toast.error(error.message);
    }
  };

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="alfred-h1">Notas</h1>
        <button onClick={openCapture} className="alfred-new-btn">
          <IconPlus size={14} /> Nueva
        </button>
      </header>

      <div
        style={{
          position: "relative",
          marginBottom: 12,
        }}
      >
        <IconSearch
          size={14}
          stroke={1.8}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-tertiary)",
            pointerEvents: "none",
          }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en título o contenido..."
          style={{
            width: "100%",
            fontSize: 13,
            padding: "8px 12px 8px 32px",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Limpiar"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-tertiary)",
              display: "flex",
            }}
          >
            <IconX size={14} />
          </button>
        )}
      </div>

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
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            {query ? "Sin resultados para tu búsqueda." : "Aún no has guardado nada por aquí."}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
            {query ? "Prueba con otras palabras." : "Tus ideas, highlights y notas vivirán acá."}
          </p>
        </div>
      ) : (
        <div style={{ columnCount: 2, columnGap: 12 }}>
          {filtered.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              onRemove={() => remove(n.id)}
              onSave={(patch) => updateNote(n.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onRemove,
  onSave,
}: {
  note: Note;
  onRemove: () => void;
  onSave: (patch: { content?: string; type?: string; title?: string | null }) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [draftTitle, setDraftTitle] = useState<string>(note.title ?? "");
  const [draftType, setDraftType] = useState<string>(note.type ?? "note");

  useEffect(() => {
    setDraft(note.content);
    setDraftTitle(note.title ?? "");
    setDraftType(note.type ?? "note");
  }, [note.content, note.title, note.type]);

  const type = (draftType ?? "note") as "note" | "idea" | "highlight";
  const tag: Record<string, { label: string; bg: string; color: string }> = {
    note: { label: "Nota", bg: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" },
    idea: { label: "Idea", bg: "var(--accent-subtle)", color: "var(--accent-color)" },
    highlight: { label: "Highlight", bg: "rgba(251,191,36,0.14)", color: "#fcd34d" },
  };
  const t = tag[type] ?? tag.note;
  const date = note.created_at
    ? new Date(note.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
    : "";

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error("La nota no puede estar vacía");
      return;
    }
    const trimmedTitle = draftTitle.trim();
    const patch: { content?: string; type?: string; title?: string | null } = {};
    if (trimmed !== note.content) patch.content = trimmed;
    if (draftType !== (note.type ?? "note")) patch.type = draftType;
    if (trimmedTitle !== (note.title ?? "")) patch.title = trimmedTitle || null;
    if (Object.keys(patch).length) await onSave(patch);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(note.content);
    setDraftTitle(note.title ?? "");
    setDraftType(note.type ?? "note");
    setEditing(false);
  };

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
      <div className="flex items-start justify-between mb-2 gap-2">
        {editing ? (
          <select
            value={draftType}
            onChange={(e) => setDraftType(e.target.value)}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: t.bg,
              color: t.color,
              border: "1px solid var(--border)",
            }}
          >
            <option value="note">Nota</option>
            <option value="idea">Idea</option>
            <option value="highlight">Highlight</option>
          </select>
        ) : (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: t.bg,
              color: t.color,
            }}
          >
            {t.label}
          </span>
        )}
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button onClick={save} aria-label="Guardar" style={{ color: "var(--accent-color)" }}>
                <IconCheck size={16} />
              </button>
              <button onClick={cancel} aria-label="Cancelar" style={{ color: "var(--text-tertiary)" }}>
                <IconX size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                aria-label="Editar"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-tertiary)" }}
              >
                <IconPencil size={14} />
              </button>
              <button
                onClick={onRemove}
                aria-label="Eliminar"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-tertiary)" }}
              >
                <IconTrash size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Título (opcional)"
            style={{
              width: "100%",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 8px)",
              padding: "6px 8px",
              outline: "none",
              marginBottom: 6,
            }}
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={Math.max(4, Math.min(12, draft.split("\n").length + 1))}
            style={{
              width: "100%",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 8px)",
              padding: 8,
              resize: "vertical",
              outline: "none",
            }}
          />
        </>
      ) : (
        <div onDoubleClick={() => setEditing(true)} style={{ cursor: "text" }}>
          {note.title && (
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
                lineHeight: 1.3,
              }}
            >
              {stripMentionSyntaxLoose(note.title)}
            </h3>
          )}
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: note.title ? "var(--text-secondary)" : "var(--text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {note.content}
          </p>
        </div>
      )}

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
