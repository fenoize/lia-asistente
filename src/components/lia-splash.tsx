import { LiaLogo } from "./lia-logo";

export function LiaSplash() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "#08081a", animation: "liaSplashFade 0.9s ease both" }}
    >
      <LiaLogo size={130} animated />
      <style>{`
        @keyframes liaSplashFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
