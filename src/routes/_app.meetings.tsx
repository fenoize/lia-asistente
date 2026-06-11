import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconMapPin, IconVideo, IconPhone, IconBolt, IconUsers } from "@tabler/icons-react";
import { EditMeetingModal, type Attendee, type ActionItem } from "@/components/meetings/edit-meeting-modal";
import { detectUserTimeZone, formatTimeInTimeZone, getDayRangeUTC } from "@/lib/timezone";

export const Route = createFileRoute("/_app/meetings")({
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: MeetingsPage,
});

type Meeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  location: string | null;
  link: string | null;
  notes: string | null;
  preparation_needed: boolean | null;
  project_id: string | null;
  meeting_type: string | null;
  status: string | null;
  attendees: Attendee[] | null;
  summary: string | null;
  action_items: ActionItem[] | null;
  google_event_id: string | null;
};

type ProjectOption = { id: string; name: string; client_id: string | null };
type ContactOption = { id: string; name: string; email: string | null };

const STATUS_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "scheduled", label: "Programadas" },
  { value: "done", label: "Finalizadas" },
];

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function openCapture() {
  window.dispatchEvent(new CustomEvent("alfred:quick-capture"));
}

function MeetingsPage() {
  const { user } = useAuth();
  const userTimeZone = detectUserTimeZone();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
    }),
    [weekStart],
  );

  const load = async () => {
    if (!user) return;
    const startDayOffset = Math.round((weekStart.getTime() - startOfWeek(new Date()).getTime()) / 86_400_000);
    const startRange = getDayRangeUTC(userTimeZone, startDayOffset);
    const endRange = getDayRangeUTC(userTimeZone, startDayOffset + 7);
    const [m, p, c] = await Promise.all([
      supabase
        .from("meetings")
        .select("*")
        .gte("datetime", startRange.startIso)
        .lt("datetime", endRange.startIso)
        .order("datetime", { ascending: true }),
      supabase.from("projects").select("id,name,client_id").order("name"),
      supabase.from("contacts").select("id,name,email").order("name"),
    ]);
    setMeetings((m.data as Meeting[]) ?? []);
    setProjects((p.data as ProjectOption[]) ?? []);
    setContacts((c.data as ContactOption[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, weekStart, userTimeZone]);

  const navigate = useNavigate();
  const { open: openId } = Route.useSearch();
  useEffect(() => {
    if (!openId || !user) return;
    (async () => {
      const { data } = await supabase.from("meetings").select("*").eq("id", openId).maybeSingle();
      if (data) setEditing(data as Meeting);
      navigate({ to: "/meetings", search: {}, replace: true });
    })();
  }, [openId, user, navigate]);

  const dayMeetings = useMemo(
    () => meetings
      .filter((m) => sameDay(new Date(m.datetime), selected))
      .filter((m) => statusFilter === "all" || (m.status ?? "scheduled") === statusFilter),
    [meetings, selected, statusFilter],
  );

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="alfred-h1">Calendario</h1>
        <button onClick={openCapture} className="alfred-new-btn">
          <IconPlus size={14} /> Nueva reunión
        </button>
      </header>


      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {days.map((d, i) => {
          const isSel = sameDay(d, selected);
          return (
            <button
              key={i}
              onClick={() => setSelected(d)}
              className="flex-1 flex flex-col items-center"
              style={{
                gap: 4,
                padding: "10px 16px",
                borderRadius: 10,
                background: isSel ? "transparent" : "#111",
                border: isSel
                  ? "1px solid rgba(99,102,241,0.5)"
                  : "1px solid #1a1a1a",
                transition: "border-color 0.15s",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: isSel ? "#818cf8" : "#555",
                }}
              >
                {DAYS[i]}
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: isSel ? 600 : 500,
                  color: isSel ? "#f2f2f2" : "#888",
                }}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5" style={{ marginBottom: 16 }}>
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.value;
          return (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 100,
                background: active ? "rgba(99,102,241,0.15)" : "transparent",
                border: `1px solid ${active ? "rgba(99,102,241,0.4)" : "#1e1e1e"}`,
                color: active ? "#a5b4fc" : "#666",
              }}>
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Skeletons />
      ) : dayMeetings.length === 0 ? (
        <div className="text-center" style={{ padding: "80px 0" }}>
          <p style={{ fontSize: 14, color: "#333" }}>Sin reuniones este día.</p>
          <p style={{ fontSize: 13, color: "#2a2a2a", marginTop: 6 }}>
            Buen momento para ejecutar.
          </p>
        </div>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dayMeetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} onClick={() => setEditing(m)} />
          ))}
        </ul>
      )}

      {editing && (
        <EditMeetingModal
          meeting={editing}
          projects={projects}
          contacts={contacts}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}


function MeetingCard({ meeting: m, onClick }: { meeting: Meeting; onClick: () => void }) {
  const time = formatTimeInTimeZone(m.datetime, detectUserTimeZone());
  const type = m.meeting_type ?? "in_person";
  const TypeIcon = type === "video" ? IconVideo : type === "phone" ? IconPhone : IconMapPin;
  const typePlace = m.link || m.location;
  const isDone = m.status === "done";
  const isCancelled = m.status === "cancelled";
  const accent = isCancelled ? "#6b7280" : isDone ? "#4ade80" : "#6366f1";
  const attendeeCount = m.attendees?.length ?? 0;

  return (
    <li
      onClick={onClick}
      style={{
        background: "#111111",
        border: "1px solid #1e1e1e",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 12,
        padding: "16px 20px",
        cursor: "pointer",
        transition: "border-color 0.15s",
        opacity: isCancelled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.3)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1e1e1e"; }}
    >
      <div className="flex items-center gap-3 mb-1">
        <span style={{ fontSize: 14, fontWeight: 600, color: accent, fontVariantNumeric: "tabular-nums" }}>
          {time}
        </span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "#e0e0e0",
          textDecoration: isCancelled ? "line-through" : "none" }}>
          {m.title}
        </span>
        {m.google_event_id && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100,
            background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)",
            color: "#8ab4f8", letterSpacing: "0.04em" }}>
            Google
          </span>
        )}
        {m.duration_minutes && (
          <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 100,
            background: "#1a1a1a", border: "1px solid #222", color: "#666" }}>
            {m.duration_minutes}m
          </span>
        )}
      </div>

      {typePlace && (
        <div className="flex items-center gap-1.5 mt-1" style={{ fontSize: 12, color: "#555" }}>
          <TypeIcon size={12} />
          <span className="truncate">{typePlace}</span>
        </div>
      )}

      {attendeeCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1" style={{ fontSize: 12, color: "#555" }}>
          <IconUsers size={12} />
          <span className="truncate">
            {m.attendees!.slice(0, 3).map((a) => a.name).join(", ")}
            {attendeeCount > 3 ? ` +${attendeeCount - 3}` : ""}
          </span>
        </div>
      )}

      {isDone && m.summary && (
        <p className="mt-2" style={{ fontSize: 12, color: "#888", lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {m.summary}
        </p>
      )}

      {!isDone && m.notes && (
        <p className="mt-2 truncate" style={{ fontSize: 12, color: "#555" }}>
          {m.notes}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {m.preparation_needed && !isDone && (
          <span className="inline-flex items-center gap-1"
            style={{ fontSize: 11, padding: "2px 10px", borderRadius: 100,
              background: "rgba(251,146,60,0.14)", color: "#fdba74" }}>
            <IconBolt size={10} /> Requiere prep
          </span>
        )}
        {isDone && (m.action_items?.length ?? 0) > 0 && (
          <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 100,
            background: "rgba(34,197,94,0.12)", color: "#86efac" }}>
            {m.action_items!.length} action items
          </span>
        )}
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
            height: 72,
            borderRadius: 12,
            background: "#111",
            opacity: 0.5,
            animation: "alfredShimmer 1.4s infinite",
          }}
        />
      ))}
    </div>
  );
}
