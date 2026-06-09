import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconMapPin, IconVideo, IconBolt } from "@tabler/icons-react";
import { EditMeetingModal } from "@/components/meetings/edit-meeting-modal";
import { detectUserTimeZone, formatTimeInTimeZone, getDayRangeUTC } from "@/lib/timezone";

export const Route = createFileRoute("/_app/meetings")({
  component: MeetingsPage,
});

type Meeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  preparation_needed: boolean | null;
  project_id: string | null;
};

type ProjectOption = { id: string; name: string };

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
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Meeting | null>(null);
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
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .gte("datetime", startRange.startIso)
      .lt("datetime", endRange.startIso)
      .order("datetime", { ascending: true });
    setMeetings((data as Meeting[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, weekStart, userTimeZone]);

  const dayMeetings = useMemo(
    () => meetings.filter((m) => sameDay(new Date(m.datetime), selected)),
    [meetings, selected],
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
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function MeetingCard({ meeting: m, onClick }: { meeting: Meeting; onClick: () => void }) {
  const time = formatTimeInTimeZone(m.datetime, detectUserTimeZone());
  const isLink = !!m.location && /^https?:\/\//.test(m.location);

  return (
    <li
      onClick={onClick}
      style={{
        background: "#111111",
        border: "1px solid #1e1e1e",
        borderLeft: "3px solid #6366f1",
        borderRadius: 12,
        padding: "16px 20px",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.3)"; (e.currentTarget as HTMLElement).style.borderLeftColor = "#6366f1"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1e1e1e"; (e.currentTarget as HTMLElement).style.borderLeftColor = "#6366f1"; }}
    >
      <div className="flex items-center gap-3 mb-1">
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#6366f1",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {time}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: 500,
            color: "#e0e0e0",
          }}
        >
          {m.title}
        </span>
        {m.duration_minutes && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 10px",
              borderRadius: 100,
              background: "#1a1a1a",
              border: "1px solid #222",
              color: "#666",
            }}
          >
            {m.duration_minutes}m
          </span>
        )}
      </div>

      {m.location && (
        <div className="flex items-center gap-1.5 mt-1" style={{ fontSize: 12, color: "#555" }}>
          {isLink ? <IconVideo size={12} /> : <IconMapPin size={12} />}
          <span className="truncate">{m.location}</span>
        </div>
      )}

      {m.notes && (
        <p className="mt-2 truncate" style={{ fontSize: 12, color: "#555" }}>
          {m.notes}
        </p>
      )}

      {m.preparation_needed && (
        <span
          className="inline-flex items-center gap-1 mt-2"
          style={{
            fontSize: 11,
            padding: "2px 10px",
            borderRadius: 100,
            background: "rgba(251,146,60,0.14)",
            color: "#fdba74",
          }}
        >
          <IconBolt size={10} /> Requiere prep
        </span>
      )}
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
