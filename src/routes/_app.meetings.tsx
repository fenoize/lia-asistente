import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconMapPin, IconVideo, IconBolt } from "@tabler/icons-react";

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
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
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
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const start = new Date(weekStart);
      const end = new Date(weekStart); end.setDate(end.getDate() + 7);
      const { data } = await supabase
        .from("meetings")
        .select("*")
        .gte("datetime", start.toISOString())
        .lt("datetime", end.toISOString())
        .order("datetime", { ascending: true });
      setMeetings((data as Meeting[]) ?? []);
      setLoading(false);
    })();
  }, [user, weekStart]);

  const dayMeetings = useMemo(
    () => meetings.filter((m) => sameDay(new Date(m.datetime), selected)),
    [meetings, selected],
  );

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="alfred-h1">Reuniones</h1>
        <button onClick={openCapture} className="alfred-new-btn">
          <IconPlus size={14} /> Nueva reunión
        </button>
      </header>

      <div className="flex gap-1.5 mb-8">
        {days.map((d, i) => {
          const isSel = sameDay(d, selected);
          const isToday = sameDay(d, new Date());
          return (
            <button
              key={i}
              onClick={() => setSelected(d)}
              className="flex-1 flex flex-col items-center gap-1"
              style={{
                padding: "10px 0",
                borderRadius: "var(--radius-md)",
                background: isSel ? "var(--accent-subtle)" : "transparent",
                border: `1px solid ${isSel ? "var(--accent-color)" : "var(--border)"}`,
                color: isSel || isToday ? "var(--accent-color)" : "var(--text-secondary)",
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: "0.08em" }}>{DAYS[i]}</span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <Skeletons />
      ) : dayMeetings.length === 0 ? (
        <div className="text-center" style={{ padding: "80px 0" }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Sin reuniones este día.</p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>Buen momento para ejecutar.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {dayMeetings.map((m) => <MeetingCard key={m.id} meeting={m} />)}
        </ul>
      )}
    </div>
  );
}

function MeetingCard({ meeting: m }: { meeting: Meeting }) {
  const t = new Date(m.datetime);
  const time = t.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const isLink = !!m.location && /^https?:\/\//.test(m.location);

  return (
    <li
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
      }}
    >
      <div className="flex items-center gap-3 mb-1">
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-color)" }}>{time}</span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>{m.title}</span>
        {m.duration_minutes && (
          <span
            style={{
              fontSize: 11, padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: "var(--bg-hover, rgba(255,255,255,0.05))",
              color: "var(--text-secondary)",
            }}
          >
            {m.duration_minutes} min
          </span>
        )}
      </div>

      {m.location && (
        <div className="flex items-center gap-1.5 mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {isLink ? <IconVideo size={12} /> : <IconMapPin size={12} />}
          <span className="truncate">{m.location}</span>
        </div>
      )}

      {m.notes && (
        <p
          className="mt-2 truncate"
          style={{ fontSize: 12, color: "var(--text-tertiary)" }}
        >
          {m.notes}
        </p>
      )}

      {m.preparation_needed && (
        <span
          className="inline-flex items-center gap-1 mt-2"
          style={{
            fontSize: 11, padding: "2px 8px",
            borderRadius: "var(--radius-pill)",
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
            height: 64, borderRadius: "var(--radius-md)",
            background: "var(--bg-elevated)", opacity: 0.5,
            animation: "alfredShimmer 1.4s infinite",
          }}
        />
      ))}
    </div>
  );
}
