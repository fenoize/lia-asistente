export function LiaSplash() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          <div
            className="absolute h-16 w-16 rounded-2xl opacity-40"
            style={{
              background: "var(--accent-color)",
              filter: "blur(28px)",
              animation: "liaPulse 1.6s ease-in-out infinite",
            }}
          />
          <div
            className="relative h-10 w-10 rounded-[10px]"
            style={{
              background: "var(--accent-color)",
              animation: "liaPulse 1.6s ease-in-out infinite",
            }}
          />
        </div>
        <span
          className="text-[15px]"
          style={{
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          lia
        </span>
      </div>
      <style>{`
        @keyframes liaPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.92); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
