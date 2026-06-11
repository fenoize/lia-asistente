import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type DashboardBlockKey =
  | "brief"
  | "priority"
  | "attention"
  | "timeline"
  | "tasks"
  | "projects"
  | "weekly"
  | "finance";

export const DASHBOARD_BLOCKS: Record<DashboardBlockKey, { label: string; description: string }> = {
  brief: { label: "Resumen Diario", description: "Briefing generado por LIA cada día. Siempre arriba." },
  priority: { label: "Próximas acciones", description: "Acciones priorizadas para hoy." },
  attention: { label: "Requiere Atención", description: "Vencidas, próxima reunión y progreso." },
  timeline: { label: "Recordatorios y Eventos", description: "Línea de tiempo combinada del día." },
  tasks: { label: "Tareas del Día", description: "Lista de tareas pendientes y completadas hoy." },
  projects: { label: "Proyectos Activos", description: "Top 3 proyectos en movimiento." },
  weekly: { label: "Esta Semana", description: "Métricas de productividad semanal." },
  finance: { label: "Finanzas del Mes", description: "Ingresos, gastos y próximos vencimientos." },
};

export const DEFAULT_ORDER: DashboardBlockKey[] = [
  "priority", "attention", "timeline", "tasks", "projects", "weekly", "finance",
];

export const DEFAULT_BLOCKS: Record<DashboardBlockKey, boolean> = {
  brief: true, priority: true, attention: true, timeline: true,
  tasks: true, projects: true, weekly: true, finance: true,
};

const CACHE_KEY = "dashboard:blocks:cache";
const ORDER_CACHE_KEY = "dashboard:blocks:order";

function getCachedBlocks(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getCachedOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(ORDER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useDashboardBlocks() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<Record<DashboardBlockKey, boolean>>(DEFAULT_BLOCKS);
  const [order, setOrder] = useState<DashboardBlockKey[]>(DEFAULT_ORDER);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("dashboard_blocks, dashboard_block_order")
        .eq("id", user.id)
        .maybeSingle();
      const row = data as {
        dashboard_blocks?: Partial<Record<DashboardBlockKey, boolean>>;
        dashboard_block_order?: string[];
      } | null;
      if (row?.dashboard_blocks) setBlocks({ ...DEFAULT_BLOCKS, ...row.dashboard_blocks });
      if (row?.dashboard_block_order?.length) {
        const stored = row.dashboard_block_order.filter((k): k is DashboardBlockKey =>
          DEFAULT_ORDER.includes(k as DashboardBlockKey),
        );
        const merged = [...stored, ...DEFAULT_ORDER.filter((k) => !stored.includes(k))];
        setOrder(merged);
      }
      setLoading(false);
    })();
  }, [user]);

  const toggle = useCallback(async (key: DashboardBlockKey) => {
    if (!user) return;
    const next = { ...blocks, [key]: !blocks[key] };
    setBlocks(next);
    await supabase.from("profiles").update({ dashboard_blocks: next } as never).eq("id", user.id);
  }, [user, blocks]);

  const reorder = useCallback(async (next: DashboardBlockKey[]) => {
    if (!user) return;
    setOrder(next);
    await supabase.from("profiles").update({ dashboard_block_order: next } as never).eq("id", user.id);
  }, [user]);

  return { blocks, order, toggle, reorder, loading };
}
