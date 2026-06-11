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

export const DASHBOARD_BLOCKS: { key: DashboardBlockKey; label: string; description: string }[] = [
  { key: "brief", label: "Resumen Diario", description: "Briefing generado por LIA cada día." },
  { key: "priority", label: "Próximas acciones", description: "Acciones priorizadas para hoy." },
  { key: "attention", label: "Requiere Atención", description: "Vencidas, próxima reunión y progreso." },
  { key: "timeline", label: "Recordatorios y Eventos", description: "Línea de tiempo combinada del día." },
  { key: "tasks", label: "Tareas del Día", description: "Lista de tareas pendientes y completadas hoy." },
  { key: "projects", label: "Proyectos Activos", description: "Top 3 proyectos en movimiento." },
  { key: "weekly", label: "Esta Semana", description: "Métricas de productividad semanal." },
  { key: "finance", label: "Finanzas del Mes", description: "Ingresos, gastos y próximos vencimientos." },
];

export const DEFAULT_BLOCKS: Record<DashboardBlockKey, boolean> = {
  brief: true, priority: true, attention: true, timeline: true,
  tasks: true, projects: true, weekly: true, finance: true,
};

export function useDashboardBlocks() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<Record<DashboardBlockKey, boolean>>(DEFAULT_BLOCKS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("dashboard_blocks")
        .eq("id", user.id)
        .maybeSingle();
      const stored = (data as { dashboard_blocks?: Partial<Record<DashboardBlockKey, boolean>> } | null)?.dashboard_blocks;
      if (stored) setBlocks({ ...DEFAULT_BLOCKS, ...stored });
      setLoading(false);
    })();
  }, [user]);

  const toggle = useCallback(async (key: DashboardBlockKey) => {
    if (!user) return;
    const next = { ...blocks, [key]: !blocks[key] };
    setBlocks(next);
    await supabase.from("profiles").update({ dashboard_blocks: next } as never).eq("id", user.id);
  }, [user, blocks]);

  return { blocks, toggle, loading };
}
