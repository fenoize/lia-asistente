import { useNavigate } from "@tanstack/react-router";
import { parseMentions } from "@/lib/mentions";

export function MentionText({ text }: { text: string }) {
  const navigate = useNavigate();
  const segs = parseMentions(text);
  if (segs.length === 0) return <>{text}</>;
  return (
    <>
      {segs.map((s, i) => {
        if (s.kind === "text") return <span key={i}>{s.value}</span>;
        const { mention } = s;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (mention.type === "contact") navigate({ to: "/contacts" });
              else navigate({ to: "/projects" });
            }}
            className="alfred-mention-chip"
            title={`${mention.type === "contact" ? "Contacto" : "Proyecto"}: ${mention.name}`}
          >
            @{mention.name}
          </span>
        );
      })}
    </>
  );
}
