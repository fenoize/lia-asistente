import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [session, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Revisa tu correo para confirmar la cuenta.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "No pudimos completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "#0d0d1a" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center mb-5"
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "linear-gradient(135deg, #6366f1 0%, #818cf8 100%)",
              boxShadow: "0 12px 40px -10px rgba(99,102,241,0.55)",
            }}
          >
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: "#ffffff",
              }}
            >
              LIA
            </span>
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#f2f2f7",
            }}
          >
            LIA
          </h1>
          <p style={{ marginTop: 6, fontSize: 13, color: "#8a8a99" }}>
            Tu asistente personal
          </p>
          <p style={{ marginTop: 18, fontSize: 14, color: "#c4c4cf" }}>
            {mode === "signin" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.cl" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          <Button type="submit" disabled={busy} className="w-full rounded-[20px] h-11">
            {busy ? "Un segundo…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>¿No tienes cuenta?{" "}
              <button onClick={() => setMode("signup")} className="text-foreground hover:text-primary transition">Regístrate</button>
            </>
          ) : (
            <>¿Ya tienes cuenta?{" "}
              <button onClick={() => setMode("signin")} className="text-foreground hover:text-primary transition">Entra</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
