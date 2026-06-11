import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { detectUserTimeZone, getDayRangeUTC } from "@/lib/timezone";
import { usePrefetchStore } from "@/hooks/use-prefetch-store";

const MESSAGES = [
  "Estamos poniendo orden donde tú dejaste creatividad.",
  "Organizando el caos. Otra vez.",
  "Ya revisé todo. Como siempre.",
  "Estoy un paso adelante. De nada.",
  "Detectando problemas futuros. Es un talento.",
  "Intentando proteger tu tiempo de ti mismo.",
  "Preparando tu Daily Brief.",
  "Te ahorré un par de dolores de cabeza.",
  "Construyendo un plan para que hoy avance de verdad.",
  "Convenciendo a tus tareas de cooperar.",
  "Estoy resolviendo cosas que aún no sabes que existen.",
  "Tengo algunas recomendaciones para ti.",
  "Estoy organizando las piezas importantes.",
];

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function PostLoginLoader({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { setData } = usePrefetchStore();
  const [fadeOut, setFadeOut] = useState(false);
  const orderRef = useRef<string[]>(shuffled(MESSAGES));
  const [msgIdx, setMsgIdx] = useState(0);
  const [msgVisible, setMsgVisible] = useState(true);

  // Rotate messages: 3s visible, 0.5s fade
  useEffect(() => {
    let t1: number, t2: number;
    const cycle = () => {
      t1 = window.setTimeout(() => {
        setMsgVisible(false);
        t2 = window.setTimeout(() => {
          setMsgIdx((i) => (i + 1) % orderRef.current.length);
          setMsgVisible(true);
          cycle();
        }, 500);
      }, 3000);
    };
    cycle();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Prefetch + min 3s
  useEffect(() => {
    let cancelled = false;
    const tz = detectUserTimeZone();
    const range = getDayRangeUTC(tz);
    const startedAt = Date.now();

    (async () => {
      const [t, m, r, p] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .order("due_date", { ascending: true })
          .limit(80),
        supabase
          .from("meetings")
          .select("*")
          .gte("datetime", range.startIso)
          .lt("datetime", range.endExclusiveIso)
          .order("datetime"),
        supabase
          .from("reminders")
          .select("*")
          .eq("done", false)
          .gte("datetime", range.startIso)
          .lt("datetime", range.endExclusiveIso)
          .order("datetime"),
        supabase.from("projects").select("id,name").order("name"),
      ]);
      if (cancelled) return;
      setData({
        tasks: (t.data as any[]) ?? [],
        meetings: (m.data as any[]) ?? [],
        reminders: (r.data as any[]) ?? [],
        projects: (p.data as any[]) ?? [],
      });
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, 3000 - elapsed);
      window.setTimeout(() => {
        if (cancelled) return;
        setFadeOut(true);
        window.setTimeout(() => {
          if (!cancelled) onDone();
        }, 400);
      }, wait);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <>
      <style>{`
        @keyframes pll-bar-breathe { 0%,100%{opacity:.25;} 50%{opacity:.7;} }
        @keyframes pll-bar-shimmer { 0%{transform:translateX(-80px);} 100%{transform:translateX(100vw);} }
      `}</style>
      <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background: "#08081a",
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.4s ease",
      }}
    >
      <svg viewBox="0 0 399.84 399.84" width={130} height={130} xmlns="http://www.w3.org/2000/svg" aria-label="LIA">
        <style>{`
          .pll-shine1{stroke-dasharray:180 420;animation:pll-shine1 5s linear infinite;}
          .pll-shine2{stroke-dasharray:180 420;animation:pll-shine2 5s linear infinite 2.5s;}
          .pll-shine-cross{stroke-dasharray:120 380;animation:pll-shine-cross 5s linear infinite 1.2s;}
          .pll-dot1{animation:pll-pulse-dot 5s ease-in-out infinite;}
          .pll-dot2{animation:pll-pulse-dot 5s ease-in-out infinite 2.5s;}
          @keyframes pll-shine1{from{stroke-dashoffset:600;}to{stroke-dashoffset:-600;}}
          @keyframes pll-shine2{from{stroke-dashoffset:600;}to{stroke-dashoffset:-600;}}
          @keyframes pll-shine-cross{from{stroke-dashoffset:500;}to{stroke-dashoffset:-500;}}
          @keyframes pll-pulse-dot{0%,100%{r:12.3;opacity:.7;}50%{r:15.5;opacity:1;}}
        `}</style>
        <path d="M199.7,200.03s-40.72-56.45-84.86-56.45-72.49,56.45-72.49,56.45c0,0,26.1,56.31,70.88,56.31s86.47-56.31,86.47-56.31Z" fill="none" stroke="#818cf8" strokeWidth="9" strokeMiterlimit="10" opacity="0.3" />
        <path d="M200.04,200.09s40.72-56.45,84.86-56.45c44.14,0,72.49,56.45,72.49,56.45,0,0-26.1,56.31-70.88,56.31s-86.47-56.31-86.47-56.31Z" fill="none" stroke="#818cf8" strokeWidth="9" strokeMiterlimit="10" opacity="0.3" />
        <path d="M42.35,200.03s51.07-55.94,158.48.44c106.82,56.07,156.56-.38,156.56-.38" fill="none" stroke="#484aab" strokeWidth="5" strokeMiterlimit="10" opacity="0.3" />
        <path className="pll-shine1" d="M199.7,200.03s-40.72-56.45-84.86-56.45-72.49,56.45-72.49,56.45c0,0,26.1,56.31,70.88,56.31s86.47-56.31,86.47-56.31Z" fill="none" stroke="#a5b4fc" strokeWidth="9" strokeMiterlimit="10" />
        <path className="pll-shine2" d="M200.04,200.09s40.72-56.45,84.86-56.45c44.14,0,72.49,56.45,72.49,56.45,0,0-26.1,56.31-70.88,56.31s-86.47-56.31-86.47-56.31Z" fill="none" stroke="#a5b4fc" strokeWidth="9" strokeMiterlimit="10" />
        <path className="pll-shine-cross" d="M42.35,200.03s51.07-55.94,158.48.44c106.82,56.07,156.56-.38,156.56-.38" fill="none" stroke="#818cf8" strokeWidth="5" strokeMiterlimit="10" />
        <circle className="pll-dot1" cx="42.35" cy="199.96" r="12.3" fill="#a5b4fc" />
        <circle className="pll-dot2" cx="357.39" cy="200.03" r="12.3" fill="#a5b4fc" />
      </svg>

      <div
        style={{
          marginTop: 40,
          fontSize: 15,
          color: "#cbd5e1",
          textAlign: "center",
          lineHeight: 1.6,
          maxWidth: 320,
          padding: "0 20px",
          opacity: msgVisible ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      >
        {orderRef.current[msgIdx]}
      </div>

      {/* Breathing bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent, #6366f1, #818cf8, #6366f1, transparent)",
            animation: "pll-bar-breathe 2.8s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 80,
            height: "100%",
            background: "linear-gradient(90deg, transparent, rgba(165,180,252,0.9), transparent)",
            animation: "pll-bar-shimmer 2.2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
