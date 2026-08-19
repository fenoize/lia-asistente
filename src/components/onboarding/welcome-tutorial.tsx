import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  IconLayoutDashboard,
  IconChecklist,
  IconCalendar,
  IconUsers,
  IconFolder,
  IconMessageCircle,
  IconX,
} from "@tabler/icons-react";

const STEPS = [
  {
    Icon: IconLayoutDashboard,
    color: "#6366f1",
    title: "Tu centro de comando",
    desc: "Cada mañana LIA genera un resumen de tu día. Aquí ves tus tareas urgentes, lo que LIA sugiere y tus eventos del día.",
  },
  {
    Icon: IconChecklist,
    color: "#4ade80",
    title: "Organiza lo que tienes que hacer",
    desc: "Crea tareas, asígnales fecha y prioridad. LIA te avisará cuando algo esté atrasado o lleve demasiado tiempo pendiente.",
  },
  {
    Icon: IconCalendar,
    color: "#f59e0b",
    title: "Nunca más pierdas una reunión",
    desc: "Registra tus reuniones con hora, lugar y notas. LIA te recordará con anticipación para que llegues preparado.",
  },
  {
    Icon: IconUsers,
    color: "#f472b6",
    title: "Tus relaciones, organizadas",
    desc: "Guarda clientes, colegas y colaboradores. Menciónalos en tareas y reuniones con @nombre para mantener todo conectado.",
  },
  {
    Icon: IconFolder,
    color: "#a78bfa",
    title: "Agrupa tu trabajo",
    desc: "Crea proyectos para organizar tareas relacionadas. Verás el avance de cada proyecto directamente en el dashboard.",
  },
  {
    Icon: IconMessageCircle,
    color: "#38bdf8",
    title: "LIA está aquí para ayudarte",
    desc: "Pregúntale cualquier cosa, pídele que cree tareas, que resuma tu semana o que te ayude a priorizar. Es tu asistente personal.",
  },
] as const;

export function WelcomeTutorial({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tutorial_completed")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (data && !(data as { tutorial_completed?: boolean }).tutorial_completed) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function complete(goToTasks = false) {
    setOpen(false);
    try {
      await supabase
        .from("profiles")
        .update({ tutorial_completed: true } as never)
        .eq("id", userId);
    } catch {
      /* noop */
    }
    if (goToTasks) navigate({ to: "/tasks", search: {} as never });
  }

  if (!open) return null;

  const { Icon, color, title, desc } = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 480,
          background: "#111",
          border: "1px solid #1e1e1e",
          borderRadius: 16,
          padding: 28,
        }}
      >
        <button
          onClick={() => complete()}
          aria-label="Cerrar tutorial"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "transparent",
            border: "none",
            color: "#666",
            cursor: "pointer",
            padding: 4,
          }}
        >
          <IconX size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === step ? color : "#2a2a2a",
                  transition: "all .2s ease",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 11, color: "#555", fontVariantNumeric: "tabular-nums" }}>
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}1a`,
            marginBottom: 16,
          }}
        >
          <Icon size={26} color={color} />
        </div>

        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#f5f5f5", margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginTop: 8, marginBottom: 24 }}>{desc}</p>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              style={{
                fontSize: 12,
                color: "#94a3b8",
                background: "#151515",
                border: "1px solid #252525",
                borderRadius: 999,
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              ← Anterior
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => (isLast ? complete(true) : setStep((s) => s + 1))}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color,
              background: `${color}14`,
              border: `1px solid ${color}33`,
              borderRadius: 999,
              padding: "8px 18px",
              cursor: "pointer",
            }}
          >
            {isLast ? "¡Empecemos! →" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}
