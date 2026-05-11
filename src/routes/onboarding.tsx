import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [goals, setGoals] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const next = () => setStep((s) => s + 1);

  const finish = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name, role, goals, onboarding_completed: true })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const steps = [
    {
      title: "Hola. Soy Alfred.",
      sub: "Tu asistente ejecutivo. Antes de empezar, dime cómo te llamas.",
      content: (
        <div className="space-y-2">
          <Label htmlFor="name">¿Cómo te llamas?</Label>
          <Input id="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
        </div>
      ),
      canNext: name.trim().length > 0,
    },
    {
      title: `Encantado, ${name.split(" ")[0] || "tú"}.`,
      sub: "¿A qué te dedicas? Esto me ayuda a entender tu contexto.",
      content: (
        <div className="space-y-2">
          <Label htmlFor="role">Tu rol</Label>
          <Input id="role" autoFocus value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ej: Fundadora, ingeniera, médico…" />
        </div>
      ),
      canNext: role.trim().length > 0,
    },
    {
      title: "Última cosa.",
      sub: "¿En qué te puedo ayudar estas próximas semanas? Sé tan específico como quieras.",
      content: (
        <div className="space-y-2">
          <Label htmlFor="goals">Tus prioridades</Label>
          <Textarea id="goals" autoFocus value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Cerrar ronda, lanzar producto, ordenar mi semana…" rows={5} />
        </div>
      ),
      canNext: goals.trim().length > 0,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex gap-1.5 mb-10">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">{current.title}</h1>
        <p className="mt-2 text-muted-foreground">{current.sub}</p>

        <div className="mt-8">{current.content}</div>

        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button onClick={() => setStep((s) => s - 1)} className="text-sm text-muted-foreground hover:text-foreground transition">
              Atrás
            </button>
          ) : <span />}
          <Button
            disabled={!current.canNext || busy}
            onClick={isLast ? finish : next}
            className="rounded-[20px] h-11 px-6"
          >
            {busy ? "Guardando…" : isLast ? "Empezar" : "Continuar"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
