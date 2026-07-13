import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { stripMentionSyntaxLoose } from "@/lib/mentions";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconMapPin, IconVideo, IconPhone, IconBolt, IconUsers, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
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
type ViewMode = "day" | "week" | "month";

const STATUS_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "scheduled", label: "Programadas" },
  { value: "done", label: "Finalizadas" },
];

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function weekLabel(start: Date): string {
  const end = new Date(start); end.setDate(end.getDate() + 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS_SHORT[start.getMonth()]}`;
  }
  return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
}

function dayLabel(d: Date): string {
  return `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
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
  const [view, setView] = useState<ViewMode>("week");
  const [selected, setSelected] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  // Range computed from view + selected
  const { rangeStart, rangeEnd, rangeLabel, isCurrentRange } = useMemo(() => {
    if (view === "day") {
      const s = new Date(selected); s.setHours(0,0,0,0);
      const e = new Date(s); e.setDate(e.getDate() + 1);
      const today = new Date(); today.setHours(0,0,0,0);
      return { rangeStart: s, rangeEnd: e, rangeLabel: dayLabel(s), isCurrentRange: sameDay(s, today) };
    }
    if (view === "month") {
      const s = startOfMonth(selected);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      const today = new Date();
      return {
        rangeStart: s, rangeEnd: e,
        rangeLabel: `${MONTHS[s.getMonth()]} ${s.getFullYear()}`,
        isCurrentRange: s.getMonth() === today.getMonth() && s.getFullYear() === today.getFullYear(),
      };
    }
    const s = startOfWeek(selected);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    return { rangeStart: s, rangeEnd: e, rangeLabel: weekLabel(s), isCurrentRange: sameDay(s, startOfWeek(new Date())) };
  }, [view, selected]);

  const goPrev = () => setSelected(prev => {
    const d = new Date(prev);
    if (view === "day") d.setDate(d.getDate() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    return d;
  });
  const goNext = () => setSelected(prev => {
    const d = new Date(prev);
    if (view === "day") d.setDate(d.getDate() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return d;
  });
  const goToday = () => {
    const t = new Date(); t.setHours(0,0,0,0);
    setSelected(t);
  };

  const load = async () => {
    if (!user) return;
    // Compute UTC ISO range from the local rangeStart/rangeEnd in the user's TZ
    const todayLocal = new Date(); todayLocal.setHours(0,0,0,0);
    const startOffset = Math.round((rangeStart.getTime() - todayLocal.getTime()) / 86_400_000);
    const endOffset = Math.round((rangeEnd.getTime() - todayLocal.getTime()) / 86_400_000);
    const startRange = getDayRangeUTC(userTimeZone, startOffset);
    const endRange = getDayRangeUTC(userTimeZone, endOffset);
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, rangeStart.getTime(), rangeEnd.getTime(), userTimeZone]);

  const navigate = useNavigate();
  const { open: openId } = Route.useSearch();
  useEffect(() => {
    if (!openId || !user) return;
    (async () => {
      const { data } = await supabase.from("meetings").select("*").eq("id", openId).maybeSingle();
      if (data) setEditing(data as Meeting);
      navigate({ to: "/meetings", search: {} as any, replace: true });
    })();
  }, [openId, user, navigate]);

  const filtered = useMemo(
    () => meetings.filter((m) => statusFilter === "all" || (m.status ?? "scheduled") === statusFilter),
    [meetings, statusFilter],
  );

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="alfred-h1">Calendario</h1>
        <button onClick={openCapture} className="alfred-new-btn">
          <IconPlus size={14} /> Nueva reunión
        </button>
      </header>

      {/* View switcher */}
      <div className="flex gap-1.5" style={{ marginBottom: 14 }}>
        {VIEW_MODES.map((v) => {
          const active = view === v.value;
          return (
            <button key={v.value} onClick={() => setView(v.value)}
              style={{
                fontSize: 12, padding: "6px 14px", borderRadius: 100,
                background: active ? "rgba(99,102,241,0.15)" : "transparent",
                border: `1px solid ${active ? "rgba(99,102,241,0.4)" : "#1e1e1e"}`,
                color: active ? "#a5b4fc" : "#888",
                fontWeight: active ? 600 : 400,
              }}>
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button
            onClick={goPrev}
            aria-label="Anterior"
            style={{
              width: 30, height: 30, display: "grid", placeItems: "center",
              borderRadius: 8, background: "#111", border: "1px solid #1e1e1e", color: "#888",
            }}
          >
            <IconChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 13, color: "#bbb", fontWeight: 500, padding: "0 10px", fontVariantNumeric: "tabular-nums", textTransform: view === "month" ? "capitalize" : "none" }}>
            {rangeLabel}
          </span>
          <button
            onClick={goNext}
            aria-label="Siguiente"
            style={{
              width: 30, height: 30, display: "grid", placeItems: "center",
              borderRadius: 8, background: "#111", border: "1px solid #1e1e1e", color: "#888",
            }}
          >
            <IconChevronRight size={16} />
          </button>
        </div>
        {!isCurrentRange && (
          <button
            onClick={goToday}
            style={{
              fontSize: 11, padding: "5px 12px", borderRadius: 100,
              background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)",
              color: "#a5b4fc",
            }}
          >
            Hoy
          </button>
        )}
      </div>

      {view === "day" && (
        <DayView
          selected={selected}
          meetings={filtered}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          loading={loading}
          onOpen={setEditing}
        />
      )}

      {view === "week" && (
        <WeekView
          weekStart={startOfWeek(selected)}
          meetings={filtered}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          loading={loading}
          selected={selected}
          setSelected={setSelected}
          onOpen={setEditing}
        />
      )}

      {view === "month" && (
        <MonthView
          monthStart={startOfMonth(selected)}
          meetings={meetings}
          loading={loading}
          selected={selected}
          onSelectDay={(d) => { setSelected(d); setView("day"); }}
        />
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

function StatusPills({ statusFilter, setStatusFilter }: { statusFilter: string; setStatusFilter: (v: string) => void }) {
  return (
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
  );
}

function DayView({ selected, meetings, statusFilter, setStatusFilter, loading, onOpen }: {
  selected: Date; meetings: Meeting[]; statusFilter: string; setStatusFilter: (v: string) => void;
  loading: boolean; onOpen: (m: Meeting) => void;
}) {
  const dayMeetings = meetings.filter((m) => sameDay(new Date(m.datetime), selected));
  return (
    <>
      <StatusPills statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
      {loading ? <Skeletons /> : dayMeetings.length === 0 ? (
        <div className="text-center" style={{ padding: "80px 0" }}>
          <p style={{ fontSize: 14, color: "#333" }}>Sin reuniones este día.</p>
          <p style={{ fontSize: 13, color: "#2a2a2a", marginTop: 6 }}>Buen momento para ejecutar.</p>
        </div>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dayMeetings.map((m) => <MeetingCard key={m.id} meeting={m} onClick={() => onOpen(m)} />)}
        </ul>
      )}
    </>
  );
}

function WeekView({ weekStart, meetings, statusFilter, setStatusFilter, loading, selected, setSelected, onOpen }: {
  weekStart: Date; meetings: Meeting[]; statusFilter: string; setStatusFilter: (v: string) => void;
  loading: boolean; selected: Date; setSelected: (d: Date) => void; onOpen: (m: Meeting) => void;
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
    }),
    [weekStart],
  );
  const dayMeetings = meetings.filter((m) => sameDay(new Date(m.datetime), selected));

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {days.map((d, i) => {
          const isSel = sameDay(d, selected);
          const hasMeeting = meetings.some(m => sameDay(new Date(m.datetime), d));
          return (
            <button
              key={i}
              onClick={() => setSelected(d)}
              className="flex-1 flex flex-col items-center"
              style={{
                gap: 4, padding: "10px 8px", borderRadius: 10,
                background: isSel ? "transparent" : "#111",
                border: isSel ? "1px solid rgba(99,102,241,0.5)" : "1px solid #1a1a1a",
                transition: "border-color 0.15s",
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: isSel ? "#818cf8" : "#555" }}>
                {DAYS[i]}
              </span>
              <span style={{ fontSize: 18, fontWeight: isSel ? 600 : 500, color: isSel ? "#f2f2f2" : "#888" }}>
                {d.getDate()}
              </span>
              {hasMeeting ? (
                <span style={{ width: 4, height: 4, borderRadius: 999, background: isSel ? "#a5b4fc" : "#6366f1" }} />
              ) : (
                <span style={{ width: 4, height: 4 }} />
              )}
            </button>
          );
        })}
      </div>

      <StatusPills statusFilter={statusFilter} setStatusFilter={setStatusFilter} />

      {loading ? <Skeletons /> : dayMeetings.length === 0 ? (
        <div className="text-center" style={{ padding: "60px 0" }}>
          <p style={{ fontSize: 14, color: "#333" }}>Sin reuniones este día.</p>
        </div>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dayMeetings.map((m) => <MeetingCard key={m.id} meeting={m} onClick={() => onOpen(m)} />)}
        </ul>
      )}
    </>
  );
}

function MonthView({ monthStart, meetings, loading, selected, onSelectDay }: {
  monthStart: Date; meetings: Meeting[]; loading: boolean; selected: Date;
  onSelectDay: (d: Date) => void;
}) {
  const cells = useMemo(() => {
    const gridStart = startOfWeek(monthStart);
    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [monthStart]);
  const today = new Date(); today.setHours(0,0,0,0);
  const monthIdx = monthStart.getMonth();

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "#555", textAlign: "center", padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === monthIdx;
          const isToday = sameDay(d, today);
          const isSel = sameDay(d, selected);
          const dayItems = meetings.filter((m) => sameDay(new Date(m.datetime), d));
          const count = dayItems.length;
          return (
            <button
              key={i}
              onClick={() => onSelectDay(d)}
              style={{
                aspectRatio: "1 / 1",
                minHeight: 44,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 3,
                padding: 4,
                borderRadius: 8,
                background: isSel ? "rgba(99,102,241,0.12)" : isToday ? "#141420" : inMonth ? "#0f0f0f" : "transparent",
                border: `1px solid ${isSel ? "rgba(99,102,241,0.5)" : isToday ? "rgba(99,102,241,0.25)" : "#1a1a1a"}`,
                color: inMonth ? (isSel ? "#f2f2f2" : "#ccc") : "#333",
                fontSize: 13,
                fontWeight: isToday ? 600 : 400,
                transition: "border-color 0.15s",
              }}
            >
              <span>{d.getDate()}</span>
              {count > 0 ? (
                <div style={{ display: "flex", gap: 2 }}>
                  {Array.from({ length: Math.min(count, 3) }).map((_, k) => (
                    <span key={k} style={{ width: 4, height: 4, borderRadius: 999, background: isSel ? "#a5b4fc" : "#6366f1" }} />
                  ))}
                </div>
              ) : (
                <span style={{ width: 4, height: 4 }} />
              )}
            </button>
          );
        })}
      </div>
      {loading && <div style={{ marginTop: 16 }}><Skeletons /></div>}
    </>
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
          {stripMentionSyntaxLoose(m.title)}
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
