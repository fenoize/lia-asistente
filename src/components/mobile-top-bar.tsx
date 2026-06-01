import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { IconBell, IconUser, IconX, IconCalendarEvent, IconChecklist, IconUsers } from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { detectUserTimeZone, formatDateTimeInTimeZone } from "@/lib/timezone";

type EntityType = "reminder" | "task" | "meeting";

type NotificationItem = {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  sent_at: string;
  title: string;
};


function formatWhen(iso: string) {
  return formatDateTimeInTimeZone(iso, detectUserTimeZone());
}

const GROUP_META: Record<EntityType, { label: string; icon: typeof IconBell }> = {
  reminder: { label: "Recordatorios", icon: IconCalendarEvent },
  task: { label: "Tareas", icon: IconChecklist },
  meeting: { label: "Reuniones", icon: IconUsers },
};

const CACHE_TTL_MS = 60_000;
const notificationsCache = new Map<string, { at: number; items: NotificationItem[] }>();

export function MobileTopBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(() => {
    if (!user) return [];
    const c = notificationsCache.get(user.id);
    return c ? c.items : [];
  });
  const [loading, setLoading] = useState(false);

  const load = async (force = false) => {
    if (!user) return;

    const cached = notificationsCache.get(user.id);
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setItems(cached.items);
      return;
    }

    setLoading(true);

    // Fire all queries in parallel from the start. The lookup tables are
    // filtered by user_id (RLS would do this anyway) so the worst case is
    // ~30 extra rows per table — cheaper than a second round trip.
    const [logsRes, remindersRes, tasksRes, meetingsRes] = await Promise.all([
      supabase
        .from("notification_log")
        .select("id, entity_type, entity_id, sent_at")
        .eq("user_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(30),
      supabase.from("reminders").select("id, title").eq("user_id", user.id),
      supabase.from("tasks").select("id, title").eq("user_id", user.id),
      supabase.from("meetings").select("id, title").eq("user_id", user.id),
    ]);

    const rows = (logsRes.data ?? []) as Array<{ id: string; entity_type: EntityType; entity_id: string; sent_at: string }>;
    const titleMap = new Map<string, string>();
    ((remindersRes.data ?? []) as Array<{ id: string; title: string }>).forEach((d) => titleMap.set(`reminder:${d.id}`, d.title));
    ((tasksRes.data ?? []) as Array<{ id: string; title: string }>).forEach((d) => titleMap.set(`task:${d.id}`, d.title));
    ((meetingsRes.data ?? []) as Array<{ id: string; title: string }>).forEach((d) => titleMap.set(`meeting:${d.id}`, d.title));

    const enriched: NotificationItem[] = rows.map((r) => ({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      sent_at: r.sent_at,
      title: titleMap.get(`${r.entity_type}:${r.entity_id}`) ?? "(elemento eliminado)",
    }));

    notificationsCache.set(user.id, { at: Date.now(), items: enriched });
    setItems(enriched);
    setLoading(false);
  };



  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const grouped: Record<EntityType, NotificationItem[]> = { reminder: [], task: [], meeting: [] };
  for (const it of items) grouped[it.entity_type].push(it);

  return (
    <>
      <style>{`
        .notifications-panel {
          left: 0; right: 0; bottom: 0;
          max-height: 85vh;
          border-radius: 20px 20px 0 0;
          border-top: 1px solid #1e1e1e;
          padding-bottom: env(safe-area-inset-bottom);
          animation: alfredSheetIn 240ms cubic-bezier(.2,.8,.2,1);
        }
        @media (min-width: 768px) {
          .notifications-panel {
            left: auto; bottom: auto;
            top: 60px; right: 16px;
            width: 380px; max-height: 70vh;
            border-radius: 14px;
            border: 1px solid #1e1e1e;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            padding-bottom: 0;
            animation: alfredQcIn 160ms ease;
          }
        }
      `}</style>
      <header
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
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 200 }}
        >
          <div
            className="md:hidden"
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "alfredQcIn 180ms ease" }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="notifications-panel"
            style={{
              position: "absolute",
              background: "#111111",
              border: "1px solid #1e1e1e",
              overflowY: "auto",
            }}
          >
            <div className="md:hidden" style={{ width: 36, height: 4, background: "#2a2a2a", borderRadius: 2, margin: "12px auto" }} />
            <div style={{ padding: "8px 24px 20px" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f2f2f2" }}>Notificaciones</h2>
                <button onClick={() => setOpen(false)} aria-label="Cerrar" style={{ color: "#666" }}>
                  <IconX size={18} />
                </button>
              </div>

              {loading && items.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        background: "#181818",
                        border: "1px solid #1e1e1e",
                        borderRadius: 12,
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        animation: "notifSkeleton 1.2s ease-in-out infinite",
                        opacity: 0.6,
                      }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#222", flexShrink: 0 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ height: 10, width: "70%", borderRadius: 4, background: "#222" }} />
                        <div style={{ height: 8, width: "40%", borderRadius: 4, background: "#1d1d1d" }} />
                      </div>
                    </div>
                  ))}
                  <style>{`@keyframes notifSkeleton { 0%,100% { opacity: 0.45; } 50% { opacity: 0.8; } }`}</style>
                </div>
              ) : items.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center" }}>
                  <IconBell size={26} stroke={1.5} color="#333" style={{ margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 14, color: "#666" }}>Sin notificaciones recientes.</p>
                </div>

              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {(Object.keys(grouped) as EntityType[]).map((type) => {
                    const list = grouped[type];
                    if (list.length === 0) return null;
                    const Meta = GROUP_META[type];
                    const Icon = Meta.icon;
                    return (
                      <div key={type}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                          {Meta.label}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {list.map((n) => (
                            <div
                              key={n.id}
                              style={{
                                background: "#181818",
                                border: "1px solid #1e1e1e",
                                borderRadius: 12,
                                padding: "12px 14px",
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                              }}
                            >
                              <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: "#1f1f1f", display: "flex",
                                alignItems: "center", justifyContent: "center",
                                color: "#a5a5f5", flexShrink: 0,
                              }}>
                                <Icon size={16} stroke={1.75} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 500, wordBreak: "break-word" }}>
                                  {n.title}
                                </div>
                                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                                  {formatWhen(n.sent_at)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
