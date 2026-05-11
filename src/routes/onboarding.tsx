import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconVenus, IconMars } from "@tabler/icons-react";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

const ROLES = ["Consultor", "Founder", "Freelance", "Manager"] as const;
const GOALS = [
  "Organización",
  "Prioridades",
  "Claridad mental",
  "Gestión del tiempo",
] as const;

const FINAL_TEXT = (userName: string, assistantName: string, gender: "feminine" | "masculine") =>
  gender === "feminine"
    ? `Hola ${userName}.\nSoy ${assistantName} y estoy lista\npara ayudarte a organizar tu semana.`
    : `Hola ${userName}.\nSoy ${assistantName} y estoy listo\npara ayudarte a organizar tu semana.`;

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [roleOther, setRoleOther] = useState("");
  const [assistantName, setAssistantName] = useState("");
  const [assistantGender, setAssistantGender] = useState<"feminine" | "masculine" | "">("");
  const [goals, setGoals] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const firstName = name.trim().split(" ")[0] || "tú";
  const finalAssistantName = assistantName.trim() || "Lia";

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && (role.trim() || roleOther.trim()).length > 0) ||
    (step === 2 && assistantName.trim().length > 0 && assistantGender !== "") ||
    (step === 3 && goals.length > 0);

  const finish = async () => {
    if (!user) return;
    setBusy(true);
    const finalRole = (role || roleOther).trim();
    const { error } = await supabase
      .from("profiles")
      .update({
        name: name.trim(),
        role: finalRole,
        goals: goals.join(", "),
        assistant_name: finalAssistantName,
        assistant_gender: assistantGender || "masculine",
        onboarding_completed: true,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
  };

  const handleNext = () => {
    if (!canNext) return;
    if (step === 3) {
      finish();
    } else if (step === 2) {
      setTransitioning(true);
    } else {
      setStep((s) => s + 1);
    }
  };

  if (done)
    return (
      <Completion
        userName={firstName}
        assistantName={finalAssistantName}
        gender={(assistantGender || "masculine") as "feminine" | "masculine"}
        onDone={() => navigate({ to: "/dashboard" })}
      />
    );

  if (transitioning)
    return (
      <AssistantIntro
        assistantName={finalAssistantName}
        gender={(assistantGender || "masculine") as "feminine" | "masculine"}
        onDone={() => {
          setTransitioning(false);
          setStep(3);
        }}
      />
    );


  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-xl">
        <StepShell key={step}>
          {step === 0 && (
            <Step
              title="Hola. Soy Alfred."
              subtitle="Tu asistente ejecutivo personal. ¿Cómo te llamas?"
            >
              <BareInput
                value={name}
                onChange={setName}
                placeholder="Tu nombre..."
                onEnter={handleNext}
              />
            </Step>
          )}

          {step === 1 && (
            <Step
              title={`¿A qué te dedicas, ${firstName}?`}
              subtitle="Esto me ayuda a entender tu contexto."
            >
              <div className="flex flex-wrap justify-center gap-2 mb-5">
                {ROLES.map((r) => (
                  <Chip
                    key={r}
                    active={role === r}
                    onClick={() => {
                      setRole(r);
                      setRoleOther("");
                    }}
                  >
                    {r}
                  </Chip>
                ))}
              </div>
              <BareInput
                value={roleOther}
                onChange={(v) => {
                  setRoleOther(v);
                  if (v) setRole("");
                }}
                placeholder="o escríbelo aquí"
                onEnter={handleNext}
              />
            </Step>
          )}

          {step === 2 && (
            <Step
              title="¿Cómo quieres llamar a tu asistente?"
              subtitle="Puedes ponerle el nombre que quieras."
            >
              <BareInput
                value={assistantName}
                onChange={(v) => setAssistantName(v.slice(0, 20))}
                placeholder="Ej: Lia, Max, Nova, Alex..."
                onEnter={() => {}}
              />
              <p
                style={{
                  marginTop: 28,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                }}
              >
                ¿Qué personalidad tiene?
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <PersonaCard
                  active={assistantGender === "feminine"}
                  onClick={() => setAssistantGender("feminine")}
                  Icon={IconVenus}
                  label="Femenina"
                  caption="Cercana, cálida, estratégica"
                />
                <PersonaCard
                  active={assistantGender === "masculine"}
                  onClick={() => setAssistantGender("masculine")}
                  Icon={IconMars}
                  label="Masculina"
                  caption="Directo, sólido, estratégico"
                />
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step
              title="¿Qué quieres mejorar?"
              subtitle="Puedes elegir más de uno."
            >
              <div className="flex flex-wrap justify-center gap-2">
                {GOALS.map((g) => (
                  <Chip
                    key={g}
                    active={goals.includes(g)}
                    onClick={() =>
                      setGoals((prev) =>
                        prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
                      )
                    }
                  >
                    {g}
                  </Chip>
                ))}
              </div>
            </Step>
          )}

          {/* Actions */}
          <div className="mt-10 flex items-center justify-center gap-4">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="transition-colors"
                style={{
                  fontSize: 13,
                  color: "var(--text-tertiary)",
                  background: "transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--text-primary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-tertiary)")
                }
              >
                Atrás
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canNext || busy}
              style={{
                background: "var(--accent-color)",
                color: "white",
                borderRadius: "var(--radius-pill)",
                padding: "9px 22px",
                fontSize: 13,
                fontWeight: 500,
                width: 120,
                opacity: !canNext || busy ? 0.4 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {busy ? "Guardando…" : "Continuar →"}
            </button>
          </div>
        </StepShell>

        {/* Dots */}
        <div className="mt-12 flex items-center justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="rounded-full transition-colors"
              style={{
                width: 6,
                height: 6,
                background:
                  i === step ? "var(--accent-color)" : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        animation: "alfredStepIn 200ms ease both",
      }}
    >
      <style>{`
        @keyframes alfredStepIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {children}
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <h1
        style={{
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.03em",
          color: "var(--text-primary)",
        }}
      >
        {title}
      </h1>
      <p
        style={{
          marginTop: 8,
          fontSize: 15,
          color: "var(--text-secondary)",
        }}
      >
        {subtitle}
      </p>
      <div className="mt-10">{children}</div>
    </div>
  );
}

function BareInput({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter();
      }}
      placeholder={placeholder}
      className="w-full text-center bg-transparent focus:outline-none"
      style={{
        height: 40,
        fontSize: 20,
        color: "var(--text-primary)",
        borderBottom: "1px solid var(--border)",
      }}
    />
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("transition-colors")}
      style={{
        border: `1px solid ${active ? "var(--accent-color)" : "var(--border)"}`,
        background: active ? "var(--accent-subtle)" : "transparent",
        color: active ? "var(--accent-color)" : "var(--text-secondary)",
        borderRadius: "var(--radius-pill)",
        padding: "8px 20px",
        fontSize: 13,
      }}
    >
      {children}
    </button>
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
        padding: active ? "23px" : "24px",
      }}
    >
      <div className="flex items-center justify-center mb-3">
        <Icon
          size={28}
          stroke={1.5}
          color={active ? "var(--accent-color)" : "var(--text-secondary)"}
        />
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: active ? "var(--accent-color)" : "var(--text-primary)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: "var(--text-tertiary)",
          lineHeight: 1.4,
        }}
      >
        {caption}
      </div>
    </button>
  );
}

function AssistantIntro({
  assistantName,
  gender,
  onDone,
}: {
  assistantName: string;
  gender: "feminine" | "masculine";
  onDone: () => void;
}) {
  const full =
    gender === "feminine"
      ? `${assistantName} está lista para conocerte.`
      : `${assistantName} está listo para conocerte.`;
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(onDone, 1500);
        }
      }
    }, 35);
    return () => clearInterval(id);
  }, [full, onDone]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <p
        className="text-center"
        style={{
          fontSize: 24,
          color: "var(--text-primary)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
        }}
      >
        {shown}
        <span
          className="inline-block ml-0.5"
          style={{
            width: 8,
            height: 22,
            background: "var(--accent-color)",
            verticalAlign: "-4px",
            animation: "alfredBlink 1s step-end infinite",
          }}
        />
      </p>
      <style>{`@keyframes alfredBlink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

function Completion({
  userName,
  assistantName,
  gender,
  onDone,
}: {
  userName: string;
  assistantName: string;
  gender: "feminine" | "masculine";
  onDone: () => void;
}) {
  const full = FINAL_TEXT(userName, assistantName, gender);
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(onDone, 1500);
        }
      }
    }, 40);
    return () => clearInterval(id);
  }, [full, onDone]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="max-w-xl w-full">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div
            className="h-4 w-4 rounded-[4px]"
            style={{ background: "var(--accent-color)" }}
          />
          <span
            style={{
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              fontSize: 15,
            }}
          >
            {assistantName.toLowerCase()}
          </span>
        </div>
        <p
          className="whitespace-pre-line text-center"
          style={{
            fontSize: 22,
            lineHeight: 1.5,
            color: "var(--text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          {shown}
          <span
            className="inline-block ml-0.5"
            style={{
              width: 8,
              height: 22,
              background: "var(--accent-color)",
              verticalAlign: "-4px",
              animation: "alfredBlink 1s step-end infinite",
            }}
          />
        </p>
        <style>{`
          @keyframes alfredBlink {
            50% { opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
