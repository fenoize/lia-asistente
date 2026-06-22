import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical } from "@tabler/icons-react";
import { IconVenus, IconMars, IconRefresh, IconReload, IconEyeOff, IconChevronDown, IconCheck, IconUser, IconClock, IconCalendar, IconLayoutDashboard, IconChevronRight, IconSparkles, IconUserCircle, IconMessageCircle, IconIdBadge, IconTarget, IconBriefcase, IconX } from "@tabler/icons-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import { usePwaUpdate } from "@/hooks/use-pwa-update";
import { useHideAmounts } from "@/hooks/use-hide-amounts";
import { useDashboardBlocks, DASHBOARD_BLOCKS, type DashboardBlockKey } from "@/hooks/use-dashboard-blocks";
import { startGoogleOAuth, getGoogleStatus, disconnectGoogle } from "@/lib/google-oauth.functions";
import { pullGoogleEvents } from "@/lib/google-sync.functions";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

type Gender = "feminine" | "masculine";
type Tone = "casual" | "formal" | "direct";


const TONE_OPTIONS: { id: Tone; label: string; caption: string }[] = [
  { id: "casual", label: "Casual", caption: "Cercana, conversacional" },
  { id: "formal", label: "Formal", caption: "Profesional, cuidada" },
  { id: "direct", label: "Directo", caption: "Breve, al grano" },
];

const GOAL_OPTIONS: { id: "focus" | "projects" | "clarity" | "growth"; title: string; subtitle: string }[] = [
  { id: "focus", title: "Claridad y foco diario", subtitle: "Saber qué hacer cada día sin distracciones" },
  { id: "projects", title: "Control de proyectos y clientes", subtitle: "Que nada se escape entre proyectos activos" },
  { id: "clarity", title: "Reducir el caos mental", subtitle: "Recuperar el control cuando todo se acumula" },
  { id: "growth", title: "Hacer crecer mi negocio", subtitle: "Invertir el tiempo en lo que realmente importa" },
];

const WEEKDAYS: { id: string; label: string }[] = [
  { id: "mon", label: "L" },
  { id: "tue", label: "M" },
  { id: "wed", label: "X" },
  { id: "thu", label: "J" },
  { id: "fri", label: "V" },
  { id: "sat", label: "S" },
  { id: "sun", label: "D" },
];

const TIMEZONES = [
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
];

const GOAL_LABELS: Record<string, string> = Object.fromEntries(
  GOAL_OPTIONS.map((g) => [g.id, g.title]),
);

function formatWorkDays(days: string[]): string {
  const all = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return days
    .slice()
    .sort((a, b) => all.indexOf(a) - all.indexOf(b))
    .map((d) => labels[all.indexOf(d)])
    .filter(Boolean)
    .join("·");
}

type SheetKey =
  | "nombre"
  | "personalidad"
  | "tono"
  | "llamame"
  | "objetivo"
  | "timezone"
  | "horario"
  | "bloques"
  | null;

function SettingsPage() {
  const { user } = useAuth();
  const { hasUpdate, checking, forcing, update, skipWaiting, forceUpdate } = usePwaUpdate();
  const [checkedOnce, setCheckedOnce] = useState(false);
  const { hidden: hideAmounts, set: setHideAmounts } = useHideAmounts();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [name, setName] = useState("Lia");
  const [gender, setGender] = useState<Gender>("feminine");

  const [goals, setGoals] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [timezone, setTimezone] = useState<string>("America/Santiago");
  const [savingProfile, setSavingProfile] = useState(false);

  const [workDays, setWorkDays] = useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [workStart, setWorkStart] = useState<string>("09:00");
  const [workEnd, setWorkEnd] = useState<string>("18:00");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [openSheet, setOpenSheet] = useState<SheetKey>(null);
  const closeSheet = () => setOpenSheet(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("name, assistant_name, assistant_gender, goals, lia_tone, timezone, work_days, work_start, work_end")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as Record<string, unknown>;
        setUserName(((d.name as string | null) ?? "") || "");
        setName((d.assistant_name as string | null) || "Lia");
        setGender(d.assistant_gender === "masculine" ? "masculine" : "feminine");
        setGoals((d.goals as string | null) ?? "");
        setTone(((d.lia_tone as string | null) === "formal" || d.lia_tone === "direct") ? (d.lia_tone as Tone) : "casual");
        setTimezone((d.timezone as string | null) || "America/Santiago");
        const days = d.work_days as string[] | null;
        if (days && days.length) setWorkDays(days);
        setWorkStart(((d.work_start as string | null) ?? "09:00:00").slice(0, 5));
        setWorkEnd(((d.work_end as string | null) ?? "18:00:00").slice(0, 5));
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    const finalName = name.trim() || "Lia";
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ assistant_name: finalName, assistant_gender: gender })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Guardado ✓");
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: userName.trim() || null, goals: goals.trim() || null, lia_tone: tone, timezone })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success("Perfil guardado ✓");
  };

  const toggleDay = (day: string) =>
    setWorkDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(
      (a, b) => WEEKDAYS.findIndex((w) => w.id === a) - WEEKDAYS.findIndex((w) => w.id === b),
    )));

  const saveSchedule = async () => {
    if (!user) return;
    if (workDays.length === 0) {
      toast.error("Selecciona al menos un día");
      return;
    }
    if (workStart >= workEnd) {
      toast.error("La hora de inicio debe ser menor que la de fin");
      return;
    }
    setSavingSchedule(true);
    const { error } = await supabase
      .from("profiles")
      .update({ work_days: workDays, work_start: workStart, work_end: workEnd })
      .eq("id", user.id);
    setSavingSchedule(false);
    if (error) toast.error(error.message);
    else toast.success("Horario guardado ✓");
  };

  const greetingPreview =
    gender === "feminine"
      ? `Hola ${userName || "tú"}. Soy ${name.trim() || "Lia"} y estoy lista para ayudarte a organizar tu semana.`
      : `Hola ${userName || "tú"}. Soy ${name.trim() || "Lia"} y estoy listo para ayudarte a organizar tu semana.`;

  return (
    <div className="mx-auto" style={{ maxWidth: 480, padding: "40px 20px 80px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: 4 }}>
        Ajustes
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 24 }}>
        Personaliza tu experiencia.
      </p>

      <SectionHeader label="Tu asistente" />
      <SettingsGroup>
        <SettingsRow
          icon={<IconSparkles size={18} stroke={1.75} color="rgb(129,140,248)" />}
          iconBg="rgba(99,102,241,0.12)"
          label="Nombre"
          value={name || "Lia"}
          onClick={() => setOpenSheet("nombre")}
        />
        <SettingsRow
          icon={<IconUserCircle size={18} stroke={1.75} color="rgb(192,132,252)" />}
          iconBg="rgba(168,85,247,0.12)"
          label="Personalidad"
          value={gender === "feminine" ? "Femenina" : "Masculino"}
          onClick={() => setOpenSheet("personalidad")}
        />
        <SettingsRow
          icon={<IconMessageCircle size={18} stroke={1.75} color="rgb(45,212,191)" />}
          iconBg="rgba(20,184,166,0.12)"
          label="Tono"
          value={TONE_OPTIONS.find((t) => t.id === tone)?.label}
          onClick={() => setOpenSheet("tono")}
        />
      </SettingsGroup>

      <SectionHeader label="Tu perfil" />
      <SettingsGroup>
        <SettingsRow
          icon={<IconIdBadge size={18} stroke={1.75} color="rgb(251,191,36)" />}
          iconBg="rgba(245,158,11,0.12)"
          label="¿Cómo quieres que te llame?"
          value={userName || "—"}
          onClick={() => setOpenSheet("llamame")}
        />
        <SettingsRow
          icon={<IconTarget size={18} stroke={1.75} color="rgb(52,211,153)" />}
          iconBg="rgba(16,185,129,0.12)"
          label="Objetivo principal"
          value={GOAL_LABELS[goals] ?? (goals ? "Personalizado" : "Sin definir")}
          onClick={() => setOpenSheet("objetivo")}
        />
        <SettingsRow
          icon={<IconClock size={18} stroke={1.75} color="rgb(129,140,248)" />}
          iconBg="rgba(99,102,241,0.12)"
          label="Zona horaria"
          value={timezone}
          onClick={() => setOpenSheet("timezone")}
        />
        <SettingsRow
          icon={<IconBriefcase size={18} stroke={1.75} color="rgb(244,114,182)" />}
          iconBg="rgba(236,72,153,0.12)"
          label="Horario laboral"
          hint={workDays.length ? `${formatWorkDays(workDays)} · ${workStart}–${workEnd}` : "Sin configurar"}
          onClick={() => setOpenSheet("horario")}
        />
      </SettingsGroup>

      <SectionHeader label="Inicio" />
      <SettingsGroup>
        <SettingsRow
          icon={<IconLayoutDashboard size={18} stroke={1.75} color="rgb(129,140,248)" />}
          iconBg="rgba(99,102,241,0.12)"
          label="Bloques visibles"
          hint="Activa y reordena los bloques del dashboard"
          onClick={() => setOpenSheet("bloques")}
        />
      </SettingsGroup>

      <SectionHeader label="Privacidad" />
      <SettingsGroup>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(148,163,184,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <IconEyeOff size={18} stroke={1.75} color="var(--text-tertiary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>Ocultar montos</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Reemplaza montos en Finanzas por puntos</div>
          </div>
          <button
            onClick={() => setHideAmounts(!hideAmounts)}
            aria-pressed={hideAmounts}
            style={{ width: 44, height: 26, borderRadius: 100, background: hideAmounts ? "var(--accent-color)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0, border: "none", cursor: "pointer" }}
          >
            <span style={{ position: "absolute", top: 3, left: hideAmounts ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
          </button>
        </div>
      </SettingsGroup>

      <PushNotificationsSettings />

      <GoogleCalendarSection />

      <section style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, marginTop: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 16 }}>
          Aplicación
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: hasUpdate ? "var(--accent-subtle)" : checkedOnce && !checking ? "rgba(34,197,94,0.12)" : "var(--bg-base)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {hasUpdate ? (
              <IconReload size={20} color="var(--accent-color)" stroke={1.5} />
            ) : checkedOnce && !checking ? (
              <IconCheck size={20} color="#22c55e" stroke={2} />
            ) : (
              <IconRefresh size={20} color="var(--text-tertiary)" stroke={1.5} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
              {hasUpdate ? "¡Hay una nueva versión disponible!" : checkedOnce && !checking ? "Estás en la última versión" : "Versión actual"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              {hasUpdate ? "Reinicia para aplicar la actualización." : checking ? "Buscando actualizaciones…" : "v0.5.0"}
            </div>
          </div>
        </div>

        {hasUpdate ? (
          <button onClick={skipWaiting} style={{ background: "var(--accent-color)", color: "white", borderRadius: "var(--radius-pill)", padding: "9px 22px", fontSize: 13, fontWeight: 500 }}>
            Reiniciar y actualizar
          </button>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              onClick={async () => { await update(); setCheckedOnce(true); }}
              disabled={checking || forcing}
              style={{ background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", padding: "9px 22px", fontSize: 13, opacity: checking || forcing ? 0.5 : 1 }}
            >
              {checking ? "Buscando…" : "Buscar actualizaciones"}
            </button>
            <button
              onClick={() => {
                if (window.confirm("Esto borrará la caché y recargará la app desde cero. ¿Continuar?")) {
                  forceUpdate();
                }
              }}
              disabled={checking || forcing}
              title="Borra caché y service workers, y recarga la app"
              style={{ background: "transparent", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "var(--radius-pill)", padding: "9px 22px", fontSize: 13, opacity: checking || forcing ? 0.5 : 1 }}
            >
              {forcing ? "Forzando…" : "Forzar actualización"}
            </button>
          </div>
        )}
      </section>

      <AboutSection />

      {/* ============ SHEETS ============ */}

      <BottomSheet open={openSheet === "nombre"} onClose={closeSheet} title="Nombre del asistente">
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12 }}>
          Así se presentará tu IA.
        </p>
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Lia, Max, Nova…"
          style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", fontSize: 15, color: "var(--text-primary)", outline: "none" }}
        />
        <SheetSaveButton onClick={async () => { await save(); closeSheet(); }} loading={saving} />
      </BottomSheet>

      <BottomSheet open={openSheet === "personalidad"} onClose={closeSheet} title="Personalidad">
        <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
          <PersonaCard active={gender === "feminine"} onClick={() => setGender("feminine")} Icon={IconVenus} label="Femenina" caption="Cercana, cálida" />
          <PersonaCard active={gender === "masculine"} onClick={() => setGender("masculine")} Icon={IconMars} label="Masculino" caption="Directo, sólido" />
        </div>
        <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 600 }}>Vista previa</div>
          <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{greetingPreview}</p>
        </div>
        <SheetSaveButton onClick={async () => { await save(); closeSheet(); }} loading={saving} />
      </BottomSheet>

      <BottomSheet open={openSheet === "tono"} onClose={closeSheet} title="Tono">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TONE_OPTIONS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTone(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", border: `1px solid ${tone === t.id ? "var(--accent-color)" : "var(--border)"}`, background: tone === t.id ? "var(--accent-subtle)" : "transparent", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{t.caption}</div>
              </div>
              {tone === t.id && <IconCheck size={18} color="var(--accent-color)" stroke={2} />}
            </button>
          ))}
        </div>
        <SheetSaveButton onClick={async () => { await saveProfile(); closeSheet(); }} loading={savingProfile} />
      </BottomSheet>

      <BottomSheet open={openSheet === "llamame"} onClose={closeSheet} title="¿Cómo quieres que te llame?">
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12 }}>
          LIA te llamará así en saludos y resúmenes.
        </p>
        <input
          value={userName}
          maxLength={40}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Tu nombre"
          style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", fontSize: 15, color: "var(--text-primary)", outline: "none" }}
        />
        <SheetSaveButton
          onClick={async () => {
            if (!user) return;
            await supabase.from("profiles").update({ name: userName.trim() || null }).eq("id", user.id);
            toast.success("Guardado ✓");
            closeSheet();
          }}
        />
      </BottomSheet>

      <BottomSheet open={openSheet === "objetivo"} onClose={closeSheet} title="Objetivo principal">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoals(g.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", border: `1px solid ${goals === g.id ? "var(--accent-color)" : "var(--border)"}`, background: goals === g.id ? "var(--accent-subtle)" : "transparent", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{g.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{g.subtitle}</div>
              </div>
              {goals === g.id && <IconCheck size={18} color="var(--accent-color)" stroke={2} />}
            </button>
          ))}
        </div>
        <SheetSaveButton onClick={async () => { await saveProfile(); closeSheet(); }} loading={savingProfile} />
      </BottomSheet>

      <BottomSheet open={openSheet === "timezone"} onClose={closeSheet} title="Zona horaria">
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", fontSize: 15, color: "var(--text-primary)", outline: "none" }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        <SheetSaveButton onClick={async () => { await saveProfile(); closeSheet(); }} loading={savingProfile} />
      </BottomSheet>

      <BottomSheet open={openSheet === "horario"} onClose={closeSheet} title="Horario laboral">
        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
          Días laborales
        </label>
        <div className="flex gap-1.5" style={{ marginBottom: 20 }}>
          {WEEKDAYS.map((d) => {
            const active = workDays.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggleDay(d.id)}
                style={{ width: 36, height: 36, borderRadius: "50%", background: active ? "var(--accent-color)" : "transparent", border: `1px solid ${active ? "var(--accent-color)" : "var(--border)"}`, color: active ? "white" : "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Hora de inicio</label>
            <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 14, color: "var(--text-primary)", outline: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Hora de fin</label>
            <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 14, color: "var(--text-primary)", outline: "none" }} />
          </div>
        </div>
        <SheetSaveButton onClick={async () => { await saveSchedule(); closeSheet(); }} loading={savingSchedule} />
      </BottomSheet>

      <BottomSheet open={openSheet === "bloques"} onClose={closeSheet} title="Bloques visibles">
        <DashboardBlocksSection />
      </BottomSheet>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontWeight: 600, padding: "20px 14px 8px" }}>
      {label}
    </div>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  const arr = React.Children.toArray(children);
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      {arr.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div style={{ height: 1, background: "var(--border-subtle)", marginLeft: 60 }} />}
          {child}
        </React.Fragment>
      ))}
    </div>
  );
}

function SettingsRow({
  icon, iconBg, label, hint, value, onClick, chevron = true,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor?: string;
  label: string;
  hint?: string;
  value?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onMouseEnter={(e) => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", cursor: onClick ? "pointer" : "default", transition: "background 0.15s" }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</div>}
      </div>
      {(value || chevron) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {value && (
            <span style={{ fontSize: 13, color: "var(--text-tertiary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value}
            </span>
          )}
          {chevron && <IconChevronRight size={16} stroke={1.75} color="var(--text-tertiary)" style={{ opacity: 0.6 }} />}
        </div>
      )}
    </div>
  );
}

function BottomSheet({
  open, onClose, title, children,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90, animation: "fadeIn 0.2s ease" }}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 91,
          background: "var(--bg-elevated)", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTop: "1px solid var(--border)", padding: "12px 18px 28px",
          maxHeight: "85vh", overflowY: "auto",
          animation: "sheetIn 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
        }}
      >
        <style>{`@keyframes sheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        <div style={{ width: 36, height: 4, background: "var(--border)", borderRadius: 2, margin: "4px auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: "transparent", border: "none", padding: 6, cursor: "pointer", color: "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconX size={20} stroke={1.75} />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </>
  );
}

function SheetSaveButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{ marginTop: 18, width: "100%", background: "var(--accent-color)", color: "white", borderRadius: "var(--radius-pill)", padding: "12px 22px", fontSize: 14, fontWeight: 500, border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
    >
      {loading ? "Guardando…" : "Guardar"}
    </button>
  );
}

function DashboardBlocksSection() {
  const { blocks, order, toggle, reorder, isReady } = useDashboardBlocks();
  const loading = !isReady;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(active.id as DashboardBlockKey);
    const newIdx = order.indexOf(over.id as DashboardBlockKey);
    if (oldIdx < 0 || newIdx < 0) return;
    reorder(arrayMove(order, oldIdx, newIdx));
  };

  const brief = DASHBOARD_BLOCKS.brief;

  return (
    <section
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 24,
        marginTop: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <IconLayoutDashboard size={14} color="var(--text-tertiary)" stroke={1.75} />
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", fontWeight: 600 }}>
          Personalización de Inicio
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16 }}>
        Activa, desactiva y arrastra los bloques para reordenar tu dashboard. El Resumen Diario siempre va arriba.
      </p>

      {/* Brief — pinned, no drag */}
      <BlockRow
        keyId="brief"
        label={brief.label}
        description={brief.description}
        on={blocks.brief}
        loading={loading}
        onToggle={() => toggle("brief")}
        pinned
        first
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map((key) => {
            const meta = DASHBOARD_BLOCKS[key];
            return (
              <SortableBlockRow
                key={key}
                keyId={key}
                label={meta.label}
                description={meta.description}
                on={blocks[key]}
                loading={loading}
                onToggle={() => toggle(key)}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </section>
  );
}

function BlockRow({
  keyId, label, description, on, loading, onToggle, pinned, first, dragHandleProps, dragRef, style,
}: {
  keyId: string;
  label: string;
  description: string;
  on: boolean;
  loading: boolean;
  onToggle: () => void;
  pinned?: boolean;
  first?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  dragRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      ref={dragRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 0",
        borderTop: first ? "none" : "1px solid var(--border-subtle)",
        ...style,
      }}
    >
      {pinned ? (
        <span
          aria-label="Fijo arriba"
          title="Siempre arriba"
          style={{
            width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-tertiary)", opacity: 0.5, fontSize: 11,
          }}
        >
          📌
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Arrastrar ${label}`}
          {...dragHandleProps}
          style={{
            width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", color: "var(--text-tertiary)",
            cursor: "grab", touchAction: "none",
            ...(dragHandleProps?.style ?? {}),
          }}
        >
          <IconGripVertical size={16} stroke={1.75} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{description}</div>
      </div>
      <button
        onClick={onToggle}
        disabled={loading}
        aria-pressed={on}
        aria-label={`Mostrar ${label}`}
        data-key={keyId}
        style={{
          width: 44, height: 26, borderRadius: 100,
          background: on ? "var(--accent-color)" : "var(--border)",
          position: "relative", transition: "background 0.2s",
          flexShrink: 0,
          opacity: loading ? 0.5 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            position: "absolute", top: 3, left: on ? 21 : 3,
            width: 20, height: 20, borderRadius: "50%",
            background: "white", transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

function SortableBlockRow(props: {
  keyId: DashboardBlockKey;
  label: string;
  description: string;
  on: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.keyId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "var(--bg-base)" : undefined,
    borderRadius: isDragging ? 8 : undefined,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };
  return (
    <BlockRow
      {...props}
      dragRef={setNodeRef}
      dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      style={style}
    />
  );
}


function GoogleCalendarSection() {
  const startOAuth = useServerFn(startGoogleOAuth);
  const fetchStatus = useServerFn(getGoogleStatus);
  const disconnect = useServerFn(disconnectGoogle);
  const pull = useServerFn(pullGoogleEvents);

  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchStatus().then((r) => {
      setConnected(r.connected);
      setConnectedAt(r.info?.connected_at ?? null);
    }).catch(() => setConnected(false));
  }, [fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") {
      toast.success("Google Calendar conectado ✓");
      window.history.replaceState({}, "", window.location.pathname);
      fetchStatus().then((r) => {
        setConnected(r.connected);
        setConnectedAt(r.info?.connected_at ?? null);
      });
    } else if (g === "error") {
      toast.error("No pudimos conectar con Google. Vuelve a intentarlo.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchStatus]);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await startOAuth({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.message ?? "No pudimos iniciar la conexión");
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("¿Desconectar Google Calendar? Las reuniones existentes se mantienen.")) return;
    setBusy(true);
    await disconnect();
    setConnected(false);
    setConnectedAt(null);
    setBusy(false);
    toast.success("Desconectado");
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await pull();
      if (r.ok) toast.success(`Sincronización: ${r.count} eventos`);
      else toast.error("No se pudo sincronizar");
    } catch (err: any) {
      toast.error(err?.message ?? "Error sincronizando");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 24,
        marginTop: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <IconCalendar size={14} color="var(--text-tertiary)" stroke={1.75} />
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", fontWeight: 600 }}>
          Integraciones
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: connected ? "rgba(34,197,94,0.12)" : "var(--bg-base)",
            border: "1px solid var(--border-subtle)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <IconCalendar size={20} color={connected ? "#22c55e" : "var(--text-tertiary)"} stroke={1.5} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
            Google Calendar
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
            {connected === null
              ? "Comprobando estado…"
              : connected
              ? `Conectado${connectedAt ? ` · ${new Date(connectedAt).toLocaleDateString()}` : ""}`
              : "Sincroniza reuniones en ambos sentidos."}
          </div>
        </div>
      </div>

      {connected ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleSync}
            disabled={syncing || busy}
            style={{
              background: "var(--accent-color)", color: "white",
              borderRadius: "var(--radius-pill)", padding: "9px 22px",
              fontSize: 13, fontWeight: 500, opacity: syncing || busy ? 0.5 : 1,
            }}
          >
            {syncing ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={busy}
            style={{
              background: "transparent", color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)", padding: "9px 22px",
              fontSize: 13, opacity: busy ? 0.5 : 1,
            }}
          >
            Desconectar
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={busy || connected === null}
          style={{
            background: "var(--accent-color)", color: "white",
            borderRadius: "var(--radius-pill)", padding: "9px 22px",
            fontSize: 13, fontWeight: 500, opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Conectando…" : "Conectar Google Calendar"}
        </button>
      )}
    </section>
  );
}


const CHANGELOG: Array<{ version: string; date: string; items: string[] }> = [
  {
    version: "v0.5.0",
    date: "Junio 2026",
    items: [
      "Modal de aviso cuando hay una nueva versión disponible",
      "Forzar actualización desde Configuración",
      "Kanban por estado en Tareas y Gantt con drag horizontal",
      "Contactos: cumpleaños próximos, orden, selección múltiple y swipe en mobile",
      "Splash de LIA con mensajes rotativos y barra de carga",
      "Chat: corrección del modo plan colgado tras aprobar",
    ],
  },
  {

    version: "v0.4.0",
    date: "Mayo 2026",
    items: [
      "Notificaciones push (iOS y desktop)",
      "Nueva pestaña Deudas en Finanzas",
      "Toggle para ocultar montos",
      "Panel de finanzas eliminado del Inicio",
      "Tareas completadas se mueven al final",
      "Panel de notificaciones mejorado",
      "Orden correcto: pendientes arriba, completadas abajo",
    ],
  },
  {
    version: "v0.3.0",
    date: "Mayo 2026",
    items: [
      "Captura rápida con chips de mención",
      "Optimistic UI en captura rápida",
      "Zona horaria corregida (Chile)",
      "Chat: JSON crudo eliminado de respuestas",
    ],
  },
  {
    version: "v0.2.0",
    date: "Mayo 2026",
    items: [
      "Historial del chat preservado entre módulos",
      "Hora de envío visible en mensajes",
      "Resumen de LIA expandible",
    ],
  },
  {
    version: "v0.1.0",
    date: "Mayo 2026",
    items: ["Lanzamiento inicial de LIA"],
  },
];

function AboutSection() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)",
        padding: 24,
        marginTop: 24,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        Acerca de LIA
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Versión</span>
        <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
          v0.5.0
        </span>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 12,
          width: "100%",
          background: "transparent",
          border: "none",
          color: "#a5a5f5",
          fontSize: 12,
          padding: "6px 0",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {expanded ? "Ocultar actualizaciones" : "Ver actualizaciones"}
        <IconChevronDown
          size={14}
          stroke={1.75}
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 180ms ease" }}
        />
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
          {CHANGELOG.map((release) => (
            <div key={release.version}>
              <div style={{ fontSize: 12, color: "#a5a5f5", fontWeight: 600, marginBottom: 6 }}>
                {release.version} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>— {release.date}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 3 }}>
                {release.items.map((item, idx) => (
                  <li key={idx} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


function PersonaCard({
  active,
  onClick,
  Icon,
  label,
  caption,
}: {
  active: boolean;
  onClick: () => void;
  Icon: React.ComponentType<{ size?: number; stroke?: number; color?: string }>;
  label: string;
  caption: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-center transition-colors"
      style={{
        border: `${active ? 2 : 1}px solid ${active ? "var(--accent-color)" : "var(--border)"}`,
        background: active ? "var(--accent-subtle)" : "transparent",
        borderRadius: "var(--radius-lg)",
        padding: active ? "19px" : "20px",
      }}
    >
      <div className="flex items-center justify-center mb-2">
        <Icon
          size={24}
          stroke={1.5}
          color={active ? "var(--accent-color)" : "var(--text-secondary)"}
        />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: active ? "var(--accent-color)" : "var(--text-primary)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 11,
          color: "var(--text-tertiary)",
          lineHeight: 1.4,
        }}
      >
        {caption}
      </div>
    </button>
  );
}
