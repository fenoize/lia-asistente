import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconSearch, IconShield } from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

const ADMIN_EMAIL = "diegoulloag@gmail.com";
const PLANS = ["beta", "free", "pro"] as const;
type Plan = (typeof PLANS)[number];

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  plan: string | null;
  onboarding_completed: boolean | null;
  created_at: string | null;
  bonus_tokens: number;
};

type PlanEvent = {
  id: string;
  user_id: string;
  admin_email: string;
  old_plan: string | null;
  new_plan: string;
  notes: string | null;
  created_at: string;
};

type Tab = "users" | "subs" | "history" | "usage";

const PLAN_LIMITS: Record<string, number> = {
  free: 50_000,
  beta: 300_000,
  pro: 1_000_000,
};
function planLimitOf(plan: string | null | undefined): number {
  return PLAN_LIMITS[plan ?? "free"] ?? 50_000;
}

function normalizePlan(p: string | null | undefined): Plan {
  if (p === "beta" || p === "pro") return p;
  return "free";
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return d;
  }
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("es-CL", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

const PLAN_COLORS: Record<Plan, { bg: string; fg: string; border: string }> = {
  beta: { bg: "rgba(168,85,247,0.12)", fg: "#c084fc", border: "rgba(168,85,247,0.28)" },
  free: { bg: "rgba(100,116,139,0.12)", fg: "#94a3b8", border: "rgba(100,116,139,0.28)" },
  pro: { bg: "rgba(16,185,129,0.12)", fg: "#34d399", border: "rgba(16,185,129,0.28)" },
};

function PlanBadge({ plan }: { plan: Plan }) {
  const c = PLAN_COLORS[plan];
  return (
    <span
      style={{
        display: "inline-block",
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 100,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {plan}
    </span>
  );
}

function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [usageByUser, setUsageByUser] = useState<Map<string, number>>(new Map());

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [p, e, u] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,name,email,plan,onboarding_completed,created_at,bonus_tokens")
          .order("created_at", { ascending: false }),
        supabase
          .from("plan_events")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("token_usage")
          .select("user_id, total_tokens")
          .gte("created_at", startOfMonth.toISOString()),
      ]);
      if (cancelled) return;
      if (p.error) toast.error("Error cargando perfiles");
      else setProfiles((p.data ?? []) as Profile[]);
      if (e.error) toast.error("Error cargando historial");
      else setEvents((e.data ?? []) as PlanEvent[]);
      if (!u.error) {
        const usageMap = new Map<string, number>();
        for (const row of (u.data ?? []) as { user_id: string; total_tokens: number | null }[]) {
          usageMap.set(row.user_id, (usageMap.get(row.user_id) ?? 0) + (row.total_tokens ?? 0));
        }
        setUsageByUser(usageMap);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q),
    );
  }, [profiles, search]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  const filteredEvents = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const p = profileById.get(e.user_id);
      const name = (p?.name ?? "").toLowerCase();
      const email = (p?.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [events, historySearch, profileById]);

  const counts = useMemo(() => {
    const c: Record<Plan, number> = { beta: 0, free: 0, pro: 0 };
    for (const p of profiles) c[normalizePlan(p.plan)]++;
    return c;
  }, [profiles]);

  async function changePlan(profile: Profile, newPlan: Plan) {
    if (!user?.email) return;
    const oldPlan = normalizePlan(profile.plan);
    if (oldPlan === newPlan) return;
    setSavingId(profile.id);
    // Optimistic update
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, plan: newPlan } : p)),
    );
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ plan: newPlan })
      .eq("id", profile.id);
    if (updateErr) {
      toast.error("No se pudo actualizar el plan");
      // rollback
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, plan: profile.plan } : p)),
      );
      setSavingId(null);
      return;
    }
    const { data: inserted, error: eventErr } = await supabase
      .from("plan_events")
      .insert({
        user_id: profile.id,
        admin_email: user.email,
        old_plan: oldPlan,
        new_plan: newPlan,
        notes: null,
      })
      .select()
      .single();
    if (eventErr) {
      toast.error("Plan actualizado, pero no se registró el historial");
    } else if (inserted) {
      setEvents((prev) => [inserted as PlanEvent, ...prev]);
    }
    toast.success(`Plan actualizado a ${newPlan}`);
    setSavingId(null);
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <IconShield size={40} stroke={1.25} color="#666" />
        <h1 className="alfred-h1" style={{ marginTop: 12 }}>
          Acceso denegado
        </h1>
        <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
          No tienes permisos para ver esta sección.
        </p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "users", label: "Usuarios" },
    { id: "subs", label: "Suscripciones" },
    { id: "history", label: "Historial" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="alfred-h1">Admin</h1>
          <p style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
            Panel de administración.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: active ? "rgba(99,102,241,0.15)" : "transparent",
                border: `1px solid ${active ? "rgba(99,102,241,0.3)" : "#222"}`,
                color: active ? "#818cf8" : "#555",
                borderRadius: 100,
                padding: "6px 16px",
                fontSize: 12,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>
          Cargando…
        </div>
      ) : tab === "users" ? (
        <UsersTab
          profiles={filteredProfiles}
          total={profiles.length}
          search={search}
          setSearch={setSearch}
          onChangePlan={changePlan}
          savingId={savingId}
        />
      ) : tab === "subs" ? (
        <SubsTab counts={counts} total={profiles.length} profiles={profiles} />
      ) : (
        <HistoryTab
          events={filteredEvents}
          profileById={profileById}
          search={historySearch}
          setSearch={setHistorySearch}
        />
      )}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: "#111",
        border: "1px solid #1e1e1e",
        borderRadius: 100,
        padding: "8px 16px",
        minWidth: 240,
      }}
    >
      <IconSearch size={14} stroke={1.75} color="#444" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent focus:outline-none"
        style={{ fontSize: 13, color: "#ccc" }}
      />
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  color: "#666",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "1px solid #1a1a1a",
};

const td: React.CSSProperties = {
  padding: "12px",
  fontSize: 13,
  color: "#ccc",
  borderBottom: "1px solid #141414",
  verticalAlign: "middle",
};

function UsersTab({
  profiles,
  total,
  search,
  setSearch,
  onChangePlan,
  savingId,
}: {
  profiles: Profile[];
  total: number;
  search: string;
  setSearch: (v: string) => void;
  onChangePlan: (p: Profile, plan: Plan) => void;
  savingId: string | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div style={{ fontSize: 12, color: "#666" }}>
          {total} usuario{total === 1 ? "" : "s"} en total
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nombre o email…" />
      </div>

      <div
        style={{
          background: "#0b0b0b",
          border: "1px solid #1a1a1a",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Email</th>
                <th style={th}>Plan</th>
                <th style={th}>Onboarding</th>
                <th style={th}>Registro</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const current = normalizePlan(p.plan);
                const saving = savingId === p.id;
                return (
                  <tr key={p.id}>
                    <td style={td}>{p.name ?? "—"}</td>
                    <td style={td}>{p.email ?? "—"}</td>
                    <td style={td}>
                      <select
                        value={current}
                        disabled={saving}
                        onChange={(e) => onChangePlan(p, e.target.value as Plan)}
                        style={{
                          background: "#141414",
                          color: "#ccc",
                          border: "1px solid #262626",
                          borderRadius: 6,
                          padding: "4px 8px",
                          fontSize: 12,
                        }}
                      >
                        {PLANS.map((pl) => (
                          <option key={pl} value={pl}>
                            {pl}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      {p.onboarding_completed ? (
                        <span style={{ color: "#34d399", fontSize: 12 }}>✓ Completo</span>
                      ) : (
                        <span style={{ color: "#666", fontSize: 12 }}>Pendiente</span>
                      )}
                    </td>
                    <td style={td}>{formatDate(p.created_at)}</td>
                  </tr>
                );
              })}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: "center", color: "#555" }}>
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SubsTab({
  counts,
  total,
  profiles,
}: {
  counts: Record<Plan, number>;
  total: number;
  profiles: Profile[];
}) {
  const grouped = useMemo(() => {
    const g: Record<Plan, Profile[]> = { beta: [], free: [], pro: [] };
    for (const p of profiles) g[normalizePlan(p.plan)].push(p);
    return g;
  }, [profiles]);

  const cards: { label: string; value: number; plan?: Plan }[] = [
    { label: "Total usuarios", value: total },
    { label: "Beta", value: counts.beta, plan: "beta" },
    { label: "Free", value: counts.free, plan: "free" },
    { label: "Pro", value: counts.pro, plan: "pro" },
  ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: "#0b0b0b",
              border: "1px solid #1a1a1a",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {c.label}
            </div>
            <div style={{ fontSize: 28, color: "#eee", marginTop: 6, fontWeight: 500 }}>
              {c.value}
            </div>
            {c.plan && (
              <div style={{ marginTop: 8 }}>
                <PlanBadge plan={c.plan} />
              </div>
            )}
          </div>
        ))}
      </div>

      {(["pro", "beta", "free"] as Plan[]).map((plan) => (
        <div key={plan} style={{ marginBottom: 24 }}>
          <div className="flex items-center gap-3 mb-3">
            <PlanBadge plan={plan} />
            <span style={{ fontSize: 12, color: "#666" }}>{grouped[plan].length} usuarios</span>
          </div>
          <div
            style={{
              background: "#0b0b0b",
              border: "1px solid #1a1a1a",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={th}>Nombre</th>
                    <th style={th}>Email</th>
                    <th style={th}>Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[plan].map((p) => (
                    <tr key={p.id}>
                      <td style={td}>{p.name ?? "—"}</td>
                      <td style={td}>{p.email ?? "—"}</td>
                      <td style={td}>{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                  {grouped[plan].length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ ...td, textAlign: "center", color: "#555" }}>
                        Sin usuarios en este plan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({
  events,
  profileById,
  search,
  setSearch,
}: {
  events: PlanEvent[];
  profileById: Map<string, Profile>;
  search: string;
  setSearch: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div style={{ fontSize: 12, color: "#666" }}>
          {events.length} evento{events.length === 1 ? "" : "s"}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por usuario…" />
      </div>

      <div
        style={{
          background: "#0b0b0b",
          border: "1px solid #1a1a1a",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Usuario</th>
                <th style={th}>Cambio</th>
                <th style={th}>Admin</th>
                <th style={th}>Notas</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const p = profileById.get(e.user_id);
                return (
                  <tr key={e.id}>
                    <td style={td}>{formatDateTime(e.created_at)}</td>
                    <td style={td}>
                      <div>{p?.name ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "#666" }}>{p?.email ?? e.user_id}</div>
                    </td>
                    <td style={td}>
                      <div className="flex items-center gap-2">
                        <PlanBadge plan={normalizePlan(e.old_plan)} />
                        <span style={{ color: "#555" }}>→</span>
                        <PlanBadge plan={normalizePlan(e.new_plan)} />
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 12, color: "#888" }}>{e.admin_email}</span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 12, color: "#888" }}>{e.notes ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: "center", color: "#555" }}>
                    Sin eventos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
