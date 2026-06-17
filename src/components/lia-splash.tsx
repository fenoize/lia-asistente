import { useEffect, useRef, useState } from "react";
import { LiaLogo } from "./lia-logo";

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

export function LiaSplash() {
  const orderRef = useRef<string[]>(shuffled(MESSAGES));
  const [msgIdx, setMsgIdx] = useState(0);
  const [msgVisible, setMsgVisible] = useState(true);

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
      }, 2000);
    };
    cycle();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background: "#08081a",
        animation: "liaSplashFade 0.9s ease both",
      }}
    >
      <style>{`
        @keyframes splash-bar-breathe { 0%,100%{opacity:.25;} 50%{opacity:.7;} }
        @keyframes splash-bar-shimmer { 0%{transform:translateX(-80px);} 100%{transform:translateX(100vw);} }
        @keyframes liaSplashFade { from{opacity:0;} to{opacity:1;} }
      `}</style>

      <LiaLogo size={130} animated showBackground={false} />

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
            animation: "splash-bar-breathe 2.8s ease-in-out infinite",
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
            animation: "splash-bar-shimmer 2.2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
