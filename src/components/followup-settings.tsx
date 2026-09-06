// Control centre for LIA's proactive follow-up engine.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalizePrefs } from "@/lib/followup/config";
import type { FollowUpPrefs } from "@/lib/followup/types";

const FREQUENCIES: { value: FollowUpPrefs["frequency"]; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: value ? "var(--accent-color)" : "var(--border)",
        border: "none",
        position: "relative",
        cursor: "pointer",
        transition: "background 160ms ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 22 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 160ms ease",
        }}
      />
    </button>
  );
}

function FlatRow({
  label,
  hint,
  last,
  children,
}: {
  label: string;
  hint?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 0",
        borderBottom: last ? "none" : "0.5px solid var(--border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.4 }}>{hint}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Dropdown({
  value,
  options,
  onChange,
}: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        background: "var(--bg-elevated)",
        border: "0.5px solid var(--border)",
        borderRadius: 8,
        color: "var(--text-primary)",
        fontSize: 13,
        padding: "6px 10px",
        cursor: "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FollowUpSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<FollowUpPrefs>(normalizePrefs(null));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("followup_prefs").eq("id", user.id).maybeSingle();
      setPrefs(normalizePrefs((data as { followup_prefs?: unknown } | null)?.followup_prefs));
      setLoaded(true);
    })();
  }, [user?.id]);

  const save = async (next: FollowUpPrefs) => {
    setPrefs(next);
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ followup_prefs: next } as never)
      .eq("id", user.id);
    if (error) toast.error("No pude guardar la preferencia");
  };

  if (!loaded) return null;

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)", margin: "28px 0 4px" }}>
        Seguimiento proactivo
      </div>

      <FlatRow label="Intervenciones proactivas" hint="LIA detecta qué necesita atención y te escribe.">
        <Toggle value={prefs.enabled} onChange={(v) => void save({ ...prefs, enabled: v })} />
      </FlatRow>

      <FlatRow label="Frecuencia" hint="Cuánta insistencia toleras.">
        <div style={{ display: "flex", gap: 6 }}>
          {FREQUENCIES.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => void save({ ...prefs, frequency: f.value })}
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 999,
                cursor: "pointer",
                color: prefs.frequency === f.value ? "#fff" : "var(--text-secondary)",
                background: prefs.frequency === f.value ? "var(--accent-subtle)" : "transparent",
                border: `1px solid ${prefs.frequency === f.value ? "var(--accent-color)" : "var(--border)"}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </FlatRow>

      <FlatRow label="Hora preferida" hint="Momento del día para las intervenciones.">
        <Dropdown
          value={prefs.preferred_hour}
          options={Array.from({ length: 24 }, (_, h) => ({
            value: h,
            label: `${String(h).padStart(2, "0")}:00`,
          }))}
          onChange={(v) => void save({ ...prefs, preferred_hour: v })}
        />
      </FlatRow>

      <FlatRow label="Máximo de intervenciones por día" hint="Presupuesto diario de atención.">
        <Dropdown
          value={prefs.daily_budget}
          options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: String(n) }))}
          onChange={(v) => void save({ ...prefs, daily_budget: v })}
        />
      </FlatRow>

      <FlatRow label="Sugerencias para tareas sin fecha" hint='"¿Cuándo hacemos la cotización de Italfrenos?"'>
        <Toggle value={prefs.undated} onChange={(v) => void save({ ...prefs, undated: v })} />
      </FlatRow>

      <FlatRow
        label="Limpieza de tareas antiguas"
        hint='"¿La hacemos, la agendamos o la descartamos?"'
        last
      >
        <Toggle value={prefs.stale_cleanup} onChange={(v) => void save({ ...prefs, stale_cleanup: v })} />
      </FlatRow>
    </div>
  );
}
