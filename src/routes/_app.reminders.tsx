import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconBell, IconCheck, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";

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
  window.dispatchEvent(new CustomEvent("alfred:quick-capture"));
}

function RemindersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

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
            empty="Sin recordatorios pendientes. Alfred te avisará cuando tengas uno."
          />
          {completed.length > 0 && (
            <Section
              label="COMPLETADOS"
              items={completed}
              onToggle={toggle}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  label, items, onToggle, empty,
}: {
  label: string;
  items: Reminder[];
  onToggle: (r: Reminder) => void;
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
            <ReminderRow key={r.id} reminder={r} onToggle={() => onToggle(r)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReminderRow({ reminder: r, onToggle }: { reminder: Reminder; onToggle: () => void }) {
  const dt = new Date(r.datetime);
  const fmt = dt.toLocaleString("es-CL", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <li
      className="flex items-center gap-3"
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
      <button
        onClick={onToggle}
        aria-label={r.done ? "Desmarcar" : "Marcar completado"}
        style={{
          width: 22, height: 22, borderRadius: "50%",
          border: `1.5px solid ${r.done ? "var(--accent-color)" : "var(--border)"}`,
          background: r.done ? "var(--accent-color)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
        className="hover:scale-110 transition-transform"
      >
        {r.done && <IconCheck size={12} stroke={3} color="white" />}
      </button>
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
