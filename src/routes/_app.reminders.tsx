import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { supabase } from "@/integrations/supabase/client";
import { IconBell, IconCheck, IconPlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { EditReminderModal } from "@/components/reminders/edit-reminder-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/reminders")({
  component: RemindersPage,
});

type Reminder = {
  id: string;
  title: string;
  datetime: string;
  done: boolean | null;
};

function openCapture() {
  window.dispatchEvent(
    new CustomEvent("alfred:quick-capture", { detail: { type: "reminder" } }),
  );
}

function RemindersPage() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("reminders")
        .select("*")
        .order("datetime", { ascending: true });
      setItems((data as Reminder[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (r: Reminder) => {
    const next = !r.done;
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: next } : x)));
    const { error } = await supabase.from("reminders").update({ done: next }).eq("id", r.id);
    if (error) toast.error(error.message);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const id = deleting.id;
    setItems((prev) => prev.filter((x) => x.id !== id));
    setDeleting(null);
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const upcoming = items.filter((r) => !r.done);
  const completed = items.filter((r) => !!r.done);

  return (
    <div>
      <header className="flex items-center justify-between mb-8">
        <h1 className="alfred-h1">Recordatorios</h1>
        <button onClick={openCapture} className="alfred-new-btn">
          <IconPlus size={14} /> Nuevo
        </button>
      </header>

      {loading ? (
        <Skeletons />
      ) : (
        <div className="space-y-8">
          <Section
            label="PRÓXIMOS"
            items={upcoming}
            onToggle={toggle}
            onEdit={setEditing}
            onDelete={setDeleting}
            empty={`Sin recordatorios pendientes. ${assistant.name} te avisará cuando tengas uno.`}
          />
          {completed.length > 0 && (
            <Section
              label="COMPLETADOS"
              items={completed}
              onToggle={toggle}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          )}
        </div>
      )}

      <EditReminderModal
        reminder={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) =>
          setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
        }
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar recordatorio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. "{deleting?.title}" se eliminará para siempre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({
  label, items, onToggle, onEdit, onDelete, empty,
}: {
  label: string;
  items: Reminder[];
  onToggle: (r: Reminder) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
  empty?: string;
}) {
  return (
    <section>
      <div className="alfred-section-label">{label}</div>
      {items.length === 0 && empty ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <ReminderRow
              key={r.id}
              reminder={r}
              onToggle={() => onToggle(r)}
              onEdit={() => onEdit(r)}
              onDelete={() => onDelete(r)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReminderRow({
  reminder: r, onToggle, onEdit, onDelete,
}: {
  reminder: Reminder;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dt = new Date(r.datetime);
  const fmt = dt.toLocaleString("es-CL", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <li
      className="group flex items-center gap-3"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        opacity: r.done ? 0.55 : 1,
        transition: "opacity 200ms ease, transform 200ms ease",
      }}
    >
      <IconBell size={16} style={{ color: "var(--accent-color)", flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 14, color: "var(--text-primary)",
            textDecoration: r.done ? "line-through" : "none",
          }}
        >
          {r.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{fmt}</div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          aria-label="Editar"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-tertiary)", padding: 4 }}
        >
          <IconPencil size={14} />
        </button>
        <button
          onClick={onDelete}
          aria-label="Eliminar"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-tertiary)", padding: 4 }}
        >
          <IconTrash size={14} />
        </button>
        <button
          onClick={onToggle}
          aria-label={r.done ? "Desmarcar" : "Marcar completado"}
          style={{
            width: 22, height: 22, borderRadius: "50%",
            border: `1.5px solid ${r.done ? "var(--accent-color)" : "var(--border)"}`,
            background: r.done ? "var(--accent-color)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            marginLeft: 4,
          }}
          className="hover:scale-110 transition-transform"
        >
          {r.done && <IconCheck size={12} stroke={3} color="white" />}
        </button>
      </div>
    </li>
  );
}

function Skeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 56, borderRadius: "var(--radius-md)",
            background: "var(--bg-elevated)", opacity: 0.5,
            animation: "alfredShimmer 1.4s infinite",
          }}
        />
      ))}
    </div>
  );
}
