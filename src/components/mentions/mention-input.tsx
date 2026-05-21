import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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
  el: HTMLDivElement | null;
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
const MENTION_RE = /@\[([^\]]+)\]\((contact|project):([0-9a-fA-F-]{36})\)/g;

/** Serialize the contenteditable DOM back to raw mention syntax. */
function serializeEditor(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    const raw = el.getAttribute("data-mention-raw");
    if (raw) {
      out += raw;
      return;
    }
    // Browsers wrap new lines in <div> on Enter — treat as newline boundary.
    if (el.tagName === "DIV" && out.length > 0 && !out.endsWith("\n")) {
      out += "\n";
    }
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out;
}

function createMentionSpan(
  doc: Document,
  m: { name: string; type: "contact" | "project"; id: string; raw: string },
): HTMLSpanElement {
  const span = doc.createElement("span");
  span.className = "alfred-mention-pill";
  span.setAttribute("contenteditable", "false");
  span.setAttribute("data-mention-raw", m.raw);
  span.setAttribute("data-mention-type", m.type);
  span.setAttribute("data-mention-id", m.id);
  span.setAttribute("data-mention-name", m.name);

  const label = doc.createElement("span");
  label.textContent = `@${m.name}`;
  span.appendChild(label);

  const x = doc.createElement("button");
  x.type = "button";
  x.className = "alfred-mention-pill-x";
  x.textContent = "×";
  x.setAttribute("data-mention-remove", "1");
  x.setAttribute("contenteditable", "false");
  x.setAttribute("tabindex", "-1");
  x.setAttribute("aria-label", `Quitar ${m.name}`);
  span.appendChild(x);

  return span;
}

/** Build child nodes for a given raw value string. */
function buildNodes(value: string, doc: Document): Node[] {
  const nodes: Node[] = [];
  const appendText = (text: string) => {
    if (!text) return;
    const parts = text.split("\n");
    parts.forEach((line, i) => {
      if (i > 0) nodes.push(doc.createElement("br"));
      if (line) nodes.push(doc.createTextNode(line));
    });
  };

  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(value)) !== null) {
    if (m.index > last) appendText(value.slice(last, m.index));
    nodes.push(
      createMentionSpan(doc, {
        raw: m[0],
        name: m[1],
        type: m[2] as "contact" | "project",
        id: m[3],
      }),
    );
    last = m.index + m[0].length;
  }
  if (last < value.length) appendText(value.slice(last));
  return nodes;
}

export const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  { value, onChange, onSubmit, placeholder, multiline, rows: _rows, className, style, disabled, onFocus, onBlur, autoFocus, maxRows = 6 },
  ref,
) {
  const { user } = useAuth();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string>("");
  const [contacts, setContacts] = useState<Suggestion[]>([]);
  const [projects, setProjects] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    get el() { return editorRef.current; },
  }));

  // Sync external value → DOM (only when it differs from what we last emitted)
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastValueRef.current) return;
    el.innerHTML = "";
    buildNodes(value, document).forEach((n) => el.appendChild(n));
    lastValueRef.current = value;
    setIsEmpty(!value);
  }, [value]);

  // Mount: initial render
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = "";
    buildNodes(value, document).forEach((n) => el.appendChild(n));
    lastValueRef.current = value;
    setIsEmpty(!value);
    if (autoFocus) setTimeout(() => el.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load contacts + projects
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

  function emit() {
    const el = editorRef.current;
    if (!el) return;
    const v = serializeEditor(el);
    lastValueRef.current = v;
    setIsEmpty(!v);
    onChange(v);
  }

  function getCaretTextBefore(): { text: string; node: Text | null; offset: number } | null {
    const el = editorRef.current;
    if (!el) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.endContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    try { pre.setEnd(range.endContainer, range.endOffset); } catch { return null; }
    const text = pre.toString();
    const node = range.endContainer.nodeType === Node.TEXT_NODE ? (range.endContainer as Text) : null;
    return { text, node, offset: range.endOffset };
  }

  function detectTrigger() {
    const info = getCaretTextBefore();
    if (!info) { setOpen(false); return; }
    const m = info.text.match(TRIGGER_RE);
    if (!m) { setOpen(false); return; }
    setQuery(m[1] ?? "");
    setActive(0);
    setOpen(true);
    // Caret coords for picker
    const sel = window.getSelection();
    const wrap = wrapRef.current;
    if (!sel || sel.rangeCount === 0 || !wrap) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const left = rect.left - wrapRect.left;
    const top = rect.top - wrapRect.top;
    setCoords({ left: Math.max(0, left), bottom: wrapRect.height - top });
  }

  function pickAt(idx: number) {
    const flat: Suggestion[] = [...filtered.contacts, ...filtered.projects];
    const item = flat[idx];
    if (!item) return;
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const tn = range.endContainer;
    if (tn.nodeType !== Node.TEXT_NODE) { setOpen(false); return; }
    const textNode = tn as Text;
    const offset = range.endOffset;
    const slice = (textNode.textContent ?? "").slice(0, offset);
    const m = slice.match(TRIGGER_RE);
    if (!m) { setOpen(false); return; }
    // length of @query (without any leading whitespace captured by TRIGGER_RE)
    const triggerLen = m[0].startsWith("@") ? m[0].length : m[0].length - 1;
    const startInNode = offset - triggerLen;

    // Remove @query characters
    textNode.deleteData(startInNode, triggerLen);

    // Split the text node at startInNode → `after` is the trailing text
    const after = textNode.splitText(startInNode);
    const raw = `@[${item.name}](${item.kind}:${item.id})`;
    const span = createMentionSpan(document, {
      raw,
      name: item.name,
      type: item.kind,
      id: item.id,
    });
    const space = document.createTextNode("\u00A0"); // non-breaking space so caret sits visually right after chip
    const parent = after.parentNode!;
    parent.insertBefore(span, after);
    parent.insertBefore(space, after);

    // Place caret right after the inserted space
    const newRange = document.createRange();
    newRange.setStart(space, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setOpen(false);
    emit();
    // Ensure focus stays
    editorRef.current?.focus();
  }

  function removeMentionSpan(span: HTMLElement) {
    const next = span.nextSibling;
    const prev = span.previousSibling;
    // remove a leading space we inserted after the chip
    if (next && next.nodeType === Node.TEXT_NODE) {
      const t = next as Text;
      if (t.textContent && (t.textContent.startsWith(" ") || t.textContent.startsWith("\u00A0"))) {
        t.deleteData(0, 1);
        if (!t.textContent) t.parentNode?.removeChild(t);
      }
    } else if (prev && prev.nodeType === Node.TEXT_NODE) {
      const t = prev as Text;
      if (t.textContent && (t.textContent.endsWith(" ") || t.textContent.endsWith("\u00A0"))) {
        t.deleteData(t.length - 1, 1);
      }
    }
    span.remove();
    emit();
    editorRef.current?.focus();
  }

  function onClickEditor(e: ReactMouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t && t.getAttribute && t.getAttribute("data-mention-remove") === "1") {
      e.preventDefault();
      e.stopPropagation();
      const span = t.closest("[data-mention-raw]") as HTMLElement | null;
      if (span) removeMentionSpan(span);
    }
  }

  function onKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (open && filtered.total > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % filtered.total); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => (a - 1 + filtered.total) % filtered.total); return; }
      if (e.key === "Enter")     { e.preventDefault(); pickAt(active); return; }
      if (e.key === "Tab")       { e.preventDefault(); pickAt(0); return; }
      if (e.key === "Escape")    { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      if (onSubmit) {
        e.preventDefault();
        onSubmit();
        return;
      }
      if (!multiline) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === "Enter" && e.shiftKey && multiline) {
      // Insert a <br> manually for consistent serialization
      e.preventDefault();
      document.execCommand("insertLineBreak");
      emit();
    }
  }

  function onInput() {
    emit();
    detectTrigger();
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  // Auto-resize: clamp by maxRows via maxHeight
  const lineH = (style?.lineHeight as any) ? parseFloat(String(style?.lineHeight)) : 22;
  const editorStyle: CSSProperties = {
    outline: "none",
    whiteSpace: multiline ? "pre-wrap" : "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    overflowY: multiline ? "auto" : "hidden",
    maxHeight: multiline ? `calc(${lineH * maxRows}px + 16px)` : undefined,
    ...(style ?? {}),
  };

  // Placeholder mirrors editor's padding so it aligns
  const placeholderStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    padding: (style?.padding as any),
    paddingTop: (style?.paddingTop as any),
    paddingLeft: (style?.paddingLeft as any),
    paddingRight: (style?.paddingRight as any),
    paddingBottom: (style?.paddingBottom as any),
    color: "#444",
    pointerEvents: "none",
    fontSize: style?.fontSize,
    lineHeight: style?.lineHeight,
    fontFamily: style?.fontFamily,
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline={multiline ? "true" : "false"}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck
        onInput={onInput}
        onKeyDown={onKey}
        onKeyUp={detectTrigger}
        onClick={(e) => { onClickEditor(e); detectTrigger(); }}
        onFocus={() => { onFocus?.(); detectTrigger(); }}
        onBlur={() => { onBlur?.(); setTimeout(() => setOpen(false), 120); }}
        onPaste={onPaste}
        data-placeholder={placeholder}
        className={className}
        style={editorStyle}
      />
      {isEmpty && placeholder && (
        <div style={placeholderStyle}>{placeholder}</div>
      )}
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
