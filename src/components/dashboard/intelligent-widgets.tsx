import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  IconTarget,
  IconTrendingUp,
  IconFolders,
  IconWallet,
  IconArrowRight,
  IconAlertCircle,
  IconCalendarTime,
  IconCheck,
  IconCircleDot,
  IconChevronRight,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";

// =========================================================================
// Shared section card
// =========================================================================
function Block({
  label,
  icon,
  children,
  action,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 10 }}
      >
        <div className="flex items-center gap-2 alfred-section-label" style={{ margin: 0 }}>
          {icon}
          <span>{label}</span>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#111111",
  border: "1px solid #1e1e1e",
  borderRadius: 12,
  padding: "14px 16px",
};

// =========================================================================
// 1) Próximas acciones priorizadas (deterministic scoring)
// =========================================================================
export type PriorityInput = {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    project_id?: string | null;
  }>;
  reminders: Array<{ id: string; title: string; datetime: string; done: boolean }>;
  meetings: Array<{
    id: string;
    title: string;
    datetime: string;
    duration_minutes: number | null;
    preparation_needed: boolean | null;
  }>;
  projectMap: Record<string, string>;
};

type RankedAction = {
  key: string;
  id: string;
  kind: "task" | "reminder" | "meeting";
  title: string;
  reason: string;
  to: "/tasks" | "/reminders" | "/meetings";
  tone: "danger" | "warning" | "info" | "neutral";
  score: number;
};

function rankActions({ tasks, reminders, meetings, projectMap }: PriorityInput): RankedAction[] {
  const now = Date.now();
  const items: RankedAction[] = [];

  for (const t of tasks) {
    if (t.status === "listo") continue;
    let score = 0;
    let reason = "";
    let tone: RankedAction["tone"] = "neutral";
    if (t.due_date) {
      const due = new Date(t.due_date).getTime();
      const days = Math.round((due - now) / 86_400_000);
      if (days < 0) { score += 100 + Math.min(-days, 30); reason = `Vencida hace ${-days}d`; tone = "danger"; }
      else if (days === 0) { score += 80; reason = "Vence hoy"; tone = "warning"; }
      else if (days <= 2) { score += 60 - days * 5; reason = `Vence en ${days}d`; tone = "warning"; }
      else if (days <= 7) { score += 30; reason = `Vence en ${days}d`; tone = "info"; }
    }
    if (t.priority === "high") { score += 40; reason = reason || "Prioridad alta"; tone = tone === "neutral" ? "warning" : tone; }
    if (score <= 0) continue;
    const projectName = t.project_id ? projectMap[t.project_id] : undefined;
    items.push({
      key: `t-${t.id}`,
      id: t.id,
      kind: "task",
      title: t.title,
      reason: projectName ? `${reason} · ${projectName}` : reason,
      to: "/tasks",
      tone,
      score,
    });
  }

  for (const r of reminders) {
    if (r.done) continue;
    const when = new Date(r.datetime).getTime();
    const mins = Math.round((when - now) / 60_000);
    let score = 0;
    let reason = "";
    let tone: RankedAction["tone"] = "info";
    if (mins < 0) { score = 90 + Math.min(-mins / 60, 24); reason = "Vencido"; tone = "danger"; }
    else if (mins <= 60) { score = 70; reason = `En ${mins}m`; tone = "warning"; }
    else if (mins <= 240) { score = 45; reason = `En ${Math.round(mins / 60)}h`; tone = "info"; }
    if (score === 0) continue;
    items.push({ key: `r-${r.id}`, id: r.id, kind: "reminder", title: r.title, reason, to: "/reminders", tone, score });
  }

  for (const m of meetings) {
    const when = new Date(m.datetime).getTime();
    const mins = Math.round((when - now) / 60_000);
    if (mins < -15) continue;
    let score = 0;
    let reason = "";
    let tone: RankedAction["tone"] = "info";
    if (mins <= 30) { score = 75; reason = mins <= 0 ? "Empieza ahora" : `En ${mins}m`; tone = "warning"; }
    else if (mins <= 120) { score = 50; reason = `En ${Math.round(mins / 60)}h`; tone = "info"; }
    else if (mins <= 480 && m.preparation_needed) { score = 35; reason = "Requiere preparación"; tone = "info"; }
    if (score === 0) continue;
    items.push({ key: `m-${m.id}`, id: m.id, kind: "meeting", title: m.title, reason, to: "/meetings", tone, score });
  }

  return items.sort((a, b) => b.score - a.score).slice(0, 5);
}

const TONE: Record<RankedAction["tone"], { bg: string; color: string; border: string }> = {
  danger: { bg: "rgba(248,113,113,0.08)", color: "#f87171", border: "rgba(248,113,113,0.25)" },
  warning: { bg: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "rgba(251,191,36,0.25)" },
  info: { bg: "rgba(129,140,248,0.08)", color: "#818cf8", border: "rgba(129,140,248,0.25)" },
  neutral: { bg: "#1a1a1a", color: "#94a3b8", border: "#222" },
};

const KIND_ICON: Record<RankedAction["kind"], React.ReactNode> = {
  task: <IconCircleDot size={13} stroke={1.75} />,
  reminder: <IconAlertCircle size={13} stroke={1.75} />,
  meeting: <IconCalendarTime size={13} stroke={1.75} />,
};

export function PriorityActionsWidget(props: PriorityInput) {
  const ranked = useMemo(() => rankActions(props), [props]);
  if (ranked.length === 0) return null;

  return (
    <Block
      label="PRÓXIMAS ACCIONES"
      icon={<IconTarget size={12} stroke={2} style={{ color: "#a78bfa" }} />}
    >
      <div style={cardStyle}>
        <ul className="flex flex-col" style={{ gap: 2 }}>
          {ranked.map((a) => {
            const tone = TONE[a.tone];
            return (
              <li key={a.key}>
                <Link
                  to={a.to}
                  className="flex items-center gap-3 group"
                  style={{ padding: "8px 8px", borderRadius: 8, transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#161616"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span
                    style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: tone.bg, color: tone.color,
                      border: `1px solid ${tone.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {KIND_ICON[a.kind]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ fontSize: 13, color: "#e0e0e0" }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: tone.color, marginTop: 1 }}>{a.reason}</div>
                  </div>
                  <IconChevronRight size={14} stroke={1.5} style={{ color: "#444" }} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Block>
  );
}

// =========================================================================
// 2) Insights semanales
// =========================================================================
type WeeklyStats = {
  tasksCompleted: number;
  tasksCreated: number;
  meetingsCount: number;
  meetingHours: number;
  topProject: { name: string; count: number } | null;
};

export function WeeklyInsightsWidget({ userId }: { userId: string }) {
  const [stats, setStats] = useState<WeeklyStats | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [done, created, meets, projAgg] = await Promise.all([
        supabase.from("tasks").select("id", { head: true, count: "exact" })
          .eq("user_id", userId).eq("status", "listo").gte("updated_at", weekAgo),
        supabase.from("tasks").select("id", { head: true, count: "exact" })
          .eq("user_id", userId).gte("created_at", weekAgo),
        supabase.from("meetings").select("duration_minutes")
          .eq("user_id", userId).gte("datetime", weekAgo).lt("datetime", new Date().toISOString()),
        supabase.from("tasks").select("project_id")
          .eq("user_id", userId).gte("updated_at", weekAgo).not("project_id", "is", null),
      ]);
      const totalMinutes = ((meets.data ?? []) as { duration_minutes: number | null }[])
        .reduce((s, m) => s + (m.duration_minutes ?? 60), 0);

      const counts: Record<string, number> = {};
      for (const row of (projAgg.data ?? []) as { project_id: string }[]) {
        counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
      }
      let topProject: WeeklyStats["topProject"] = null;
      const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (topId) {
        const { data: p } = await supabase.from("projects").select("name").eq("id", topId).maybeSingle();
        if (p?.name) topProject = { name: p.name, count: counts[topId] };
      }

      setStats({
        tasksCompleted: done.count ?? 0,
        tasksCreated: created.count ?? 0,
        meetingsCount: (meets.data ?? []).length,
        meetingHours: Math.round((totalMinutes / 60) * 10) / 10,
        topProject,
      });
    })();
  }, [userId]);

  if (!stats) return null;
  if (stats.tasksCompleted + stats.tasksCreated + stats.meetingsCount === 0) return null;

  return (
    <Block
      label="ESTA SEMANA"
      icon={<IconTrendingUp size={12} stroke={2} style={{ color: "#4ade80" }} />}
    >
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <StatCard label="Completadas" value={stats.tasksCompleted} hint={`de ${stats.tasksCreated} creadas`} color="#4ade80" />
        <StatCard label="Reuniones" value={stats.meetingsCount} hint={`${stats.meetingHours}h en total`} color="#818cf8" />
        {stats.topProject && (
          <div style={{ ...cardStyle, gridColumn: "span 2" }}>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Proyecto más activo
            </div>
            <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 14, color: "#f2f2f2", fontWeight: 500 }}>{stats.topProject.name}</span>
              <span style={{ fontSize: 11, color: "#a78bfa" }}>{stats.topProject.count} tareas</span>
            </div>
          </div>
        )}
      </div>
    </Block>
  );
}

function StatCard({ label, value, hint, color }: { label: string; value: number; hint: string; color: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div className="flex items-baseline gap-2" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        <span style={{ fontSize: 11, color: "#666" }}>{hint}</span>
      </div>
    </div>
  );
}

// =========================================================================
// 3) Proyectos activos
// =========================================================================
type ActiveProject = {
  id: string;
  name: string;
  status: string | null;
  total: number;
  done: number;
  nextMeeting?: { datetime: string; title: string } | null;
};

export function ActiveProjectsWidget({ userId }: { userId: string }) {
  const [projects, setProjects] = useState<ActiveProject[]>([]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data: recentTasks } = await supabase.from("tasks")
        .select("project_id,status")
        .eq("user_id", userId)
        .gte("updated_at", weekAgo)
        .not("project_id", "is", null);

      const counts: Record<string, { total: number; done: number }> = {};
      for (const row of (recentTasks ?? []) as { project_id: string; status: string }[]) {
        const entry = counts[row.project_id] ?? { total: 0, done: 0 };
        entry.total += 1;
        if (row.status === "listo") entry.done += 1;
        counts[row.project_id] = entry;
      }
      const topIds = Object.keys(counts).sort((a, b) => counts[b].total - counts[a].total).slice(0, 3);
      if (topIds.length === 0) { setProjects([]); return; }

      const { data: projs } = await supabase.from("projects")
        .select("id,name,status").in("id", topIds);

      const { data: nextMeetings } = await supabase.from("meetings")
        .select("project_id,title,datetime")
        .eq("user_id", userId)
        .in("project_id", topIds)
        .gte("datetime", new Date().toISOString())
        .order("datetime", { ascending: true });

      const meetingByProj: Record<string, { datetime: string; title: string }> = {};
      for (const m of (nextMeetings ?? []) as { project_id: string; title: string; datetime: string }[]) {
        if (!meetingByProj[m.project_id]) meetingByProj[m.project_id] = { datetime: m.datetime, title: m.title };
      }

      const list: ActiveProject[] = topIds
        .map((id) => {
          const p = (projs ?? []).find((x) => x.id === id);
          if (!p) return null;
          const c = counts[id];
          return {
            id, name: p.name, status: p.status ?? null,
            total: c.total, done: c.done,
            nextMeeting: meetingByProj[id] ?? null,
          };
        })
        .filter(Boolean) as ActiveProject[];
      setProjects(list);
    })();
  }, [userId]);

  if (projects.length === 0) return null;

  return (
    <Block
      label="PROYECTOS ACTIVOS"
      icon={<IconFolders size={12} stroke={2} style={{ color: "#a78bfa" }} />}
      action={
        <Link to="/projects" style={{ fontSize: 11, color: "#666" }} className="flex items-center gap-1 hover:text-foreground">
          Ver todos <IconArrowRight size={11} />
        </Link>
      }
    >
      <div className="flex flex-col gap-2">
        {projects.map((p) => {
          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <Link key={p.id} to="/projects" style={cardStyle} className="block hover:border-accent-subtle transition-colors">
              <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
                <span className="truncate" style={{ fontSize: 14, color: "#f2f2f2", fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {p.done}/{p.total} · {pct}%
                </span>
              </div>
              <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#4ade80" : "#818cf8", transition: "width 0.4s" }} />
              </div>
              {p.nextMeeting && (
                <div className="flex items-center gap-1.5" style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
                  <IconCalendarTime size={11} stroke={1.5} />
                  <span className="truncate">{p.nextMeeting.title}</span>
                  <span style={{ marginLeft: "auto", color: "#818cf8", whiteSpace: "nowrap" }}>
                    {relativeDate(p.nextMeeting.datetime)}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </Block>
  );
}

function relativeDate(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days <= 7) return `en ${days}d`;
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

// =========================================================================
// 4) Resumen financiero
// =========================================================================
type FinanceSummary = {
  income: number;
  expense: number;
  currency: string;
  upcoming: Array<{ id: string; label: string; amount: number; due: string; kind: "debt" | "subscription" }>;
};

export function FinanceSnapshotWidget({ userId }: { userId: string }) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const startIso = monthStart.toISOString().slice(0, 10);
      const nextMonth = new Date(monthStart); nextMonth.setMonth(nextMonth.getMonth() + 1);
      const horizon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

      const [incRes, expRes, debtRes, subRes] = await Promise.all([
        supabase.from("finance_incomes").select("amount,currency,status")
          .eq("user_id", userId).gte("paid_at", startIso).eq("status", "paid"),
        supabase.from("finance_expenses").select("amount,currency")
          .eq("user_id", userId).gte("expense_date", startIso),
        supabase.from("finance_debts").select("id,creditor,total_amount,paid_amount,currency,due_date,status")
          .eq("user_id", userId).eq("status", "active").not("due_date", "is", null)
          .lte("due_date", horizon).order("due_date"),
        supabase.from("finance_subscriptions").select("id,name,amount,currency,next_charge_date,active")
          .eq("user_id", userId).eq("active", true).not("next_charge_date", "is", null)
          .lte("next_charge_date", horizon).order("next_charge_date"),
      ]);

      const income = ((incRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const expense = ((expRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const currency = ((incRes.data?.[0] as any)?.currency) ?? ((expRes.data?.[0] as any)?.currency) ?? "CLP";

      const upcoming: FinanceSummary["upcoming"] = [
        ...((debtRes.data ?? []) as any[]).map((d) => ({
          id: `d-${d.id}`,
          label: d.creditor,
          amount: Number(d.total_amount || 0) - Number(d.paid_amount || 0),
          due: d.due_date,
          kind: "debt" as const,
        })),
        ...((subRes.data ?? []) as any[]).map((s) => ({
          id: `s-${s.id}`,
          label: s.name,
          amount: Number(s.amount || 0),
          due: s.next_charge_date,
          kind: "subscription" as const,
        })),
      ].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3);

      setSummary({ income, expense, currency, upcoming });
    })();
  }, [userId]);

  if (!summary) return null;
  if (summary.income === 0 && summary.expense === 0 && summary.upcoming.length === 0) return null;

  const net = summary.income - summary.expense;
  const fmt = (v: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: summary.currency, maximumFractionDigits: 0 }).format(v);

  return (
    <Block
      label="FINANZAS DEL MES"
      icon={<IconWallet size={12} stroke={2} style={{ color: "#fbbf24" }} />}
      action={
        <Link to="/finanzas" style={{ fontSize: 11, color: "#666" }} className="flex items-center gap-1 hover:text-foreground">
          Detalle <IconArrowRight size={11} />
        </Link>
      }
    >
      <div style={cardStyle}>
        <div className="grid grid-cols-3 gap-3" style={{ marginBottom: summary.upcoming.length > 0 ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ingresos</div>
            <div style={{ fontSize: 14, color: "#4ade80", fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{fmt(summary.income)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>Gastos</div>
            <div style={{ fontSize: 14, color: "#f87171", fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{fmt(summary.expense)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>Neto</div>
            <div style={{ fontSize: 14, color: net >= 0 ? "#f2f2f2" : "#f87171", fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{fmt(net)}</div>
          </div>
        </div>
        {summary.upcoming.length > 0 && (
          <>
            <div style={{ height: 1, background: "#1e1e1e", margin: "0 -16px 12px" }} />
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Próximos vencimientos (14d)
            </div>
            <ul className="flex flex-col gap-1.5">
              {summary.upcoming.map((u) => (
                <li key={u.id} className="flex items-center gap-2" style={{ fontSize: 12 }}>
                  {u.kind === "debt" ? (
                    <IconAlertCircle size={12} stroke={1.75} style={{ color: "#f87171", flexShrink: 0 }} />
                  ) : (
                    <IconCheck size={12} stroke={1.75} style={{ color: "#818cf8", flexShrink: 0 }} />
                  )}
                  <span className="flex-1 truncate" style={{ color: "#d0d0d0" }}>{u.label}</span>
                  <span style={{ color: "#666", fontSize: 11 }}>{relativeDate(u.due)}</span>
                  <span style={{ color: "#a78bfa", fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "right" }}>
                    {fmt(u.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Block>
  );
}
