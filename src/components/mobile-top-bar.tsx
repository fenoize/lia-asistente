import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { IconBell, IconUser, IconX } from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type Reminder = {
  id: string;
  title: string;
  datetime: string;
  done: boolean | null;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MobileTopBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);

  const pendingCount = reminders.filter((r) => !r.done).length;

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("reminders")
      .select("id, title, datetime, done")
      .eq("user_id", user.id)
      .order("datetime", { ascending: true })
      .limit(50);
    setReminders((data ?? []) as Reminder[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const toggleDone = async (r: Reminder) => {
    await supabase.from("reminders").update({ done: !r.done }).eq("id", r.id);
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: !r.done } : x)));
  };

  return (
    <>
      <header
        className="md:hidden"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 90,
          height: 52,
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #141414",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 16px",
          gap: 8,
        }}
      >
        <button
          onClick={() => { setOpen(true); void load(); }}
          aria-label="Notificaciones"
          style={{
            position: "relative",
            width: 38, height: 38, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid #1e1e1e", color: "#ccc",
          }}
        >
          <IconBell size={18} stroke={1.75} />
          {pendingCount > 0 && (
            <span
              style={{
                position: "absolute", top: 6, right: 6,
                minWidth: 16, height: 16, padding: "0 4px",
                borderRadius: 999, background: "#6366f1", color: "white",
                fontSize: 10, fontWeight: 700, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
            >
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => navigate({ to: "/settings" })}
          aria-label="Configuración"
          style={{
            width: 38, height: 38, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "1px solid #1e1e1e", color: "#ccc",
          }}
        >
          <IconUser size={18} stroke={1.75} />
        </button>
      </header>

      {open && (
        <div
          className="md:hidden"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 200 }}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "alfredQcIn 180ms ease" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0,
              maxHeight: "85vh", background: "#111111",
              borderRadius: "20px 20px 0 0", borderTop: "1px solid #1e1e1e",
              paddingBottom: "env(safe-area-inset-bottom)",
              animation: "alfredSheetIn 240ms cubic-bezier(.2,.8,.2,1)",
              overflowY: "auto",
            }}
          >
            <div style={{ width: 36, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "12px auto" }} />
            <div style={{ padding: "8px 24px 20px" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f2f2f2" }}>Notificaciones</h2>
                <button onClick={() => setOpen(false)} aria-label="Cerrar" style={{ color: "#666" }}>
                  <IconX size={18} />
                </button>
              </div>

              {loading ? (
                <p style={{ fontSize: 13, color: "#555" }}>Cargando…</p>
              ) : reminders.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center" }}>
                  <IconBell size={26} stroke={1.5} color="#333" style={{ margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 14, color: "#666" }}>Sin recordatorios.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {reminders.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => toggleDone(r)}
                      style={{
                        textAlign: "left",
                        background: r.done ? "#0d0d0d" : "#181818",
                        border: "1px solid #1e1e1e",
                        borderRadius: 12,
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        opacity: r.done ? 0.55 : 1,
                      }}
                    >
                      <span
                        style={{
                          width: 18, height: 18, borderRadius: "50%",
                          border: `1.5px solid ${r.done ? "#444" : "#6366f1"}`,
                          background: r.done ? "#6366f1" : "transparent",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 500, textDecoration: r.done ? "line-through" : "none" }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                          {formatWhen(r.datetime)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => { setOpen(false); navigate({ to: "/reminders" }); }}
                style={{
                  width: "100%", marginTop: 16,
                  background: "transparent", border: "1px solid #1e1e1e",
                  color: "#ccc", borderRadius: 10, padding: "10px 14px",
                  fontSize: 13,
                }}
              >
                Ver todos los recordatorios
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
