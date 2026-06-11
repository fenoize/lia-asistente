import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { LiaLogo } from "@/components/lia-logo";
import { LiaSplash } from "@/components/lia-splash";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", replace: true });
  }, [session, loading, navigate]);

  if (loading || session) return <LiaSplash />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "No pudimos completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email) {
      toast.error("Ingresa tu correo primero.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success("Te enviamos un correo para restablecer tu contraseña.");
    } catch (err: any) {
      toast.error(err.message ?? "No pudimos enviar el correo.");
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center px-6"
      style={{ background: "#08081a" }}
    >
      {/* Animated orbs */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 380,
          height: 380,
          top: -140,
          left: -120,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.38) 0%, rgba(99,102,241,0) 70%)",
          animation: "blob1 9s ease-in-out infinite",
          filter: "blur(20px)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 340,
          height: 340,
          bottom: -100,
          right: -100,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0) 70%)",
          animation: "blob2 11s ease-in-out infinite",
          filter: "blur(20px)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 260,
          height: 260,
          top: 200,
          left: -60,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(79,70,229,0) 70%)",
          animation: "blob3 13s ease-in-out infinite",
          filter: "blur(20px)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 200,
          height: 200,
          top: 80,
          right: -40,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(165,180,252,0.18) 0%, rgba(165,180,252,0) 70%)",
          animation: "blob2 8s ease-in-out infinite 1.5s",
          filter: "blur(20px)",
        }}
      />

      <form
        onSubmit={submit}
        className="relative w-full"
        style={{ maxWidth: 320, zIndex: 2 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div style={{ animation: "liaFadeUp 0.6s ease both" }}>
            <LiaLogo size={90} animated rectFill="rgba(17,17,39,0.8)" />
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 26,
              color: "#e2e8f0",
              letterSpacing: "0.14em",
              fontWeight: 500,
              animation: "liaFadeUp 0.6s ease 0.1s both",
            }}
          >
            LIA
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "#6366f1",
              animation: "liaFadeUp 0.6s ease 0.2s both",
            }}
          >
            Tu asistente personal
          </div>
        </div>

        <div style={{ animation: "liaFadeUp 0.6s ease 0.3s both" }} className="space-y-1.5">
          <label htmlFor="email" style={{ fontSize: 12, color: "#94a3b8", display: "block" }}>
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.cl"
            required
            style={{
              width: "100%",
              background: "rgba(17,17,39,0.6)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 12,
              padding: "11px 14px",
              color: "#e2e8f0",
              fontSize: 16,
              outline: "none",
            }}
          />
        </div>

        <div style={{ animation: "liaFadeUp 0.6s ease 0.4s both", marginTop: 14 }} className="space-y-1.5">
          <label htmlFor="password" style={{ fontSize: 12, color: "#94a3b8", display: "block" }}>
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            style={{
              width: "100%",
              background: "rgba(17,17,39,0.6)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 12,
              padding: "11px 14px",
              color: "#e2e8f0",
              fontSize: 16,
              outline: "none",
            }}
          />
        </div>

        <div style={{ textAlign: "right", marginTop: 8, animation: "liaFadeUp 0.6s ease 0.5s both" }}>
          <button
            type="button"
            onClick={forgot}
            style={{ color: "#6366f1", fontSize: 11, background: "transparent", border: "none", cursor: "pointer" }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 18,
            width: "100%",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 14,
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 500,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.7 : 1,
            animation: "liaFadeUp 0.6s ease 0.6s both",
          }}
        >
          {busy ? "Un segundo…" : "Iniciar sesión"}
        </button>
      </form>

      <style>{`
        @keyframes blob1{0%,100%{transform:translate(0,0) scale(1);}33%{transform:translate(25px,-18px) scale(1.08);}66%{transform:translate(-18px,14px) scale(0.95);}}
        @keyframes blob2{0%,100%{transform:translate(0,0) scale(1);}33%{transform:translate(-22px,18px) scale(0.92);}66%{transform:translate(18px,-12px) scale(1.06);}}
        @keyframes blob3{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(12px,22px) scale(1.07);}}
        @keyframes liaFadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
    </div>
  );
}
