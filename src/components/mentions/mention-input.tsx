import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseMentions, segmentOffsets } from "@/lib/mentions";

type Suggestion =
  | { kind: "contact"; id: string; name: string; relationship_type?: string | null; type?: string | null }
  | { kind: "project"; id: string; name: string; clientName?: string | null };

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  maxRows?: number;
};

export type MentionInputHandle = {
  focus: () => void;
  el: HTMLTextAreaElement | HTMLInputElement | null;
};

const RELATION_LABEL: Record<string, string> = {
  client: "Cliente",
  colaborador: "Colaborador",
  amigo: "Amigo",
  familiar: "Familiar",
  pareja: "Pareja",
  otro: "Otro",
  friend: "Amigo",
  family: "Familiar",
  partner: "Pareja",
  other: "Otro",
};

function relLabel(c: { relationship_type?: string | null; type?: string | null }): string {
  const r = (c.relationship_type ?? c.type ?? "").toString().toLowerCase();
  return RELATION_LABEL[r] ?? (r ? r.charAt(0).toUpperCase() + r.slice(1) : "Contacto");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const TRIGGER_RE = /(?:^|\s)@([\p{L}\p{N}_-]{0,40})$/u;

export const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  { value, onChange, onSubmit, placeholder, multiline, rows = 1, className, style, disabled, onFocus, onBlur, autoFocus, maxRows = 6 },
  ref,
) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [contacts, setContacts] = useState<Suggestion[]>([]);
  const [projects, setProjects] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    get el() { return inputRef.current; },
  }));

  // Auto-resize textarea
  useEffect(() => {
    if (!multiline) return;
    const ta = inputRef.current as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.style.height = "auto";
    const lineH = 22;
    const max = lineH * maxRows + 16;
    ta.style.height = Math.min(ta.scrollHeight, max) + "px";
  }, [value, multiline, maxRows]);

  // Load contacts + projects once when user is available
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [c, p] = await Promise.all([
        supabase.from("contacts").select("id, name, type, relationship_type").order("name").limit(200),
        supabase.from("projects").select("id, name, client_id").order("name").limit(200),
      ]);
      if (cancelled) return;
      const cs: Suggestion[] = (c.data ?? []).map((r: any) => ({
        kind: "contact", id: r.id, name: r.name, relationship_type: r.relationship_type, type: r.type,
      }));
      setContacts(cs);
      const cMap = new Map(cs.map((x) => [x.id, x.name]));
      setProjects((p.data ?? []).map((r: any) => ({
        kind: "project", id: r.id, name: r.name, clientName: r.client_id ? cMap.get(r.client_id) ?? null : null,
      })));
    })();
    return () => { cancelled = true; };
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const cs = contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4);
    const ps = projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4);
    return { contacts: cs, projects: ps, total: cs.length + ps.length };
  }, [contacts, projects, query]);

  function updateCaret() {
    const el = inputRef.current;
    if (!el) { setOpen(false); return; }
    const pos = el.selectionStart ?? 0;
    const before = value.slice(0, pos);
    const m = before.match(TRIGGER_RE);
    if (!m) { setOpen(false); return; }
    setQuery(m[1] ?? "");
    setActive(0);
    setOpen(true);
    // Compute caret coords using mirror
    requestAnimationFrame(() => {
      const wrap = wrapRef.current;
      const mirror = mirrorRef.current;
      const input = inputRef.current;
      if (!wrap || !mirror || !input) return;
      const cs = window.getComputedStyle(input);
      const props = [
        "boxSizing","width","fontFamily","fontSize","fontWeight","fontStyle","letterSpacing",
        "textTransform","textIndent","lineHeight","paddingTop","paddingBottom","paddingLeft","paddingRight",
        "borderTopWidth","borderBottomWidth","borderLeftWidth","borderRightWidth","whiteSpace","wordSpacing","wordWrap",
      ];
      props.forEach((p) => { (mirror.style as any)[p] = (cs as any)[p]; });
      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.top = "0";
      mirror.style.left = "0";
      mirror.style.whiteSpace = multiline ? "pre-wrap" : "pre";
      mirror.style.wordWrap = "break-word";
      mirror.style.overflow = "hidden";
      mirror.textContent = before;
      const span = document.createElement("span");
      span.textContent = "\u200b";
      mirror.appendChild(span);
      const inputRect = input.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const spanRect = span.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      const left = inputRect.left - wrapRect.left + (spanRect.left - mirrorRect.left) - input.scrollLeft;
      const top = inputRect.top - wrapRect.top + (spanRect.top - mirrorRect.top) - input.scrollTop;
      setCoords({ left: Math.max(0, left), bottom: wrapRect.height - top });
    });
  }

  function pickAt(idx: number) {
    const flat: Suggestion[] = [...filtered.contacts, ...filtered.projects];
    const item = flat[idx];
    if (!item) return;
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const m = before.match(TRIGGER_RE);
    if (!m) return;
    const triggerStart = pos - m[0].length + (m[0].startsWith("@") ? 0 : 1); // skip leading whitespace
    const insertion = `@[${item.name}](${item.kind}:${item.id}) `;
    const newVal = value.slice(0, triggerStart) + insertion + after;
    onChange(newVal);
    setOpen(false);
    requestAnimationFrame(() => {
      const elx = inputRef.current;
      if (!elx) return;
      const caret = triggerStart + insertion.length;
      elx.focus();
      elx.setSelectionRange(caret, caret);
    });
  }

  function onKey(e: KeyboardEvent) {
    if (open && filtered.total > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % filtered.total); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => (a - 1 + filtered.total) % filtered.total); return; }
      if (e.key === "Enter")     { e.preventDefault(); pickAt(active); return; }
      if (e.key === "Tab")       { e.preventDefault(); pickAt(0); return; }
      if (e.key === "Escape")    { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  const sharedProps = {
    value,
    onChange: (e: any) => { onChange(e.target.value); setTimeout(updateCaret, 0); },
    onKeyDown: onKey,
    onKeyUp: updateCaret,
    onClick: updateCaret,
    onFocus: () => { onFocus?.(); updateCaret(); },
    onBlur: () => { onBlur?.(); setTimeout(() => setOpen(false), 120); },
    placeholder,
    disabled,
    autoFocus,
    className,
    style,
  };

  const overlayRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Mirror computed styles from the input onto the overlay so chips align exactly with text.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const ov = overlayRef.current;
    if (!el || !ov) return;
    const cs = window.getComputedStyle(el);
    const props = [
      "boxSizing","fontFamily","fontSize","fontWeight","fontStyle","letterSpacing",
      "textTransform","textIndent","lineHeight","paddingTop","paddingBottom","paddingLeft","paddingRight",
      "borderTopWidth","borderBottomWidth","borderLeftWidth","borderRightWidth","wordSpacing","wordWrap","textAlign",
    ];
    props.forEach((p) => { (ov.style as any)[p] = (cs as any)[p]; });
    ov.style.borderStyle = "solid";
    ov.style.borderColor = "transparent";
  }, [value, multiline, className, style]);

  function removeMentionAt(start: number, raw: string) {
    let end = start + raw.length;
    // also eat one trailing space we inserted, or one leading space if no trailing
    if (value[end] === " ") end += 1;
    else if (start > 0 && value[start - 1] === " ") {
      const newVal = value.slice(0, start - 1) + value.slice(end);
      onChange(newVal);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    const newVal = value.slice(0, start) + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const overlaySegments = useMemo(() => {
    const segs = parseMentions(value);
    const offsets = segmentOffsets(segs);
    return { segs, offsets };
  }, [value]);

  const hasMentions = overlaySegments.segs.some((s) => s.kind === "mention");

  const inputStyleOverride: CSSProperties = hasMentions
    ? { ...(style ?? {}), color: "transparent", caretColor: "var(--text-primary)", WebkitTextFillColor: "transparent" }
    : (style ?? {});

  const sharedPropsFinal = {
    ...sharedProps,
    style: inputStyleOverride,
    onScroll: (e: any) => { setScrollTop(e.target.scrollTop); setScrollLeft(e.target.scrollLeft); },
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      {multiline ? (
        <textarea
          ref={(el) => { inputRef.current = el; }}
          rows={rows}
          {...sharedPropsFinal}
        />
      ) : (
        <input
          ref={(el) => { inputRef.current = el; }}
          type="text"
          {...sharedPropsFinal}
        />
      )}
      {hasMentions && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
            whiteSpace: multiline ? "pre-wrap" : "pre",
            wordWrap: "break-word",
            color: "var(--text-primary)",
          }}
        >
          <div style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}>
            {overlaySegments.segs.map((s, i) => {
              if (s.kind === "text") return <span key={i}>{s.value}</span>;
              const start = overlaySegments.offsets[i];
              return (
                <span
                  key={i}
                  className="alfred-mention-pill"
                  style={{ pointerEvents: "auto" }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  @{s.mention.name}
                  <button
                    type="button"
                    aria-label={`Quitar ${s.mention.name}`}
                    onClick={() => removeMentionAt(start, s.raw)}
                    className="alfred-mention-pill-x"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {/* trailing space so wrap matches when value ends with newline */}
            <span style={{ display: "inline-block", width: 0 }}>&#8203;</span>
          </div>
        </div>
      )}
      <div ref={mirrorRef} aria-hidden="true" />
      {open && coords && (
        <div
          className="alfred-mention-picker"
          style={{ left: coords.left, bottom: coords.bottom + 6 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.total === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 13, color: "#333" }}>
              Sin resultados para “@{query}”
            </div>
          ) : (
            <>
              {filtered.contacts.length > 0 && (
                <>
                  <div className="alfred-mention-section">CONTACTOS</div>
                  {filtered.contacts.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`alfred-mention-item ${active === i ? "is-active" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pickAt(i)}
                    >
                      <span className="alfred-mention-avatar">{initials(c.name)}</span>
                      <span style={{ flex: 1, color: "#ccc", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                      <span className="alfred-mention-badge">{relLabel(c as any)}</span>
                    </button>
                  ))}
                </>
              )}
              {filtered.projects.length > 0 && (
                <>
                  <div className="alfred-mention-section">PROYECTOS</div>
                  {filtered.projects.map((p: any, i) => {
                    const idx = filtered.contacts.length + i;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`alfred-mention-item ${active === idx ? "is-active" : ""}`}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => pickAt(idx)}
                      >
                        <span className="ti ti-briefcase" style={{ fontSize: 14, color: "#6366f1", width: 28, display: "inline-flex", justifyContent: "center" }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", color: "#ccc", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          {p.clientName && (
                            <span style={{ display: "block", color: "#444", fontSize: 11 }}>{p.clientName}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
