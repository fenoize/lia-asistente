// Mention syntax stored as: @[Display Name](contact:uuid) or @[Name](project:uuid)
export type MentionType = "contact" | "project";

export type Mention = {
  type: MentionType;
  id: string;
  name: string;
};

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "mention"; mention: Mention; raw: string };

const MENTION_RE = /@\[([^\]]+)\]\((contact|project):([0-9a-fA-F-]{36})\)/g;

export function extractMentions(text: string): Mention[] {
  const out: Mention[] = [];
  if (!text) return out;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const key = `${m[2]}:${m[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: m[1], type: m[2] as MentionType, id: m[3] });
  }
  return out;
}

export function parseMentions(text: string): Segment[] {
  const segs: Segment[] = [];
  if (!text) return segs;
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > last) {
      segs.push({ kind: "text", value: text.slice(last, m.index) });
    }
    segs.push({
      kind: "mention",
      raw: m[0],
      mention: { name: m[1], type: m[2] as MentionType, id: m[3] },
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ kind: "text", value: text.slice(last) });
  return segs;
}

/** Strip mention syntax → plain text with just the names (for previews). */
export function stripMentionSyntax(text: string): string {
  return text.replace(MENTION_RE, (_, name) => `@${name}`);
}

/**
 * Looser strip used for safety in any UI surface: replaces
 * `@[Name](contact:anything)` / `@[Name](project:anything)` with `@Name`,
 * even when the id isn't a strict uuid (e.g. when the model hallucinates one).
 */
const MENTION_RE_LOOSE = /@\[([^\]]+)\]\((?:contact|project):[^)\s]+\)/g;
export function stripMentionSyntaxLoose(text: string): string {
  if (!text) return text;
  return text.replace(MENTION_RE_LOOSE, (_, name) => `@${name}`);
}

/** Compute the start offset of each segment within the original text. */
export function segmentOffsets(segs: Segment[]): number[] {
  const out: number[] = [];
  let pos = 0;
  for (const s of segs) {
    out.push(pos);
    pos += s.kind === "text" ? s.value.length : s.raw.length;
  }
  return out;
}
