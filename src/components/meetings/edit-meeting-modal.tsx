import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IconX, IconTrash, IconPlus, IconPaperclip, IconDownload, IconUser } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { detectUserTimeZone, formatDateTimeInTimeZone, localDateTimeToUTCISOString, toDateTimeLocalInput } from "@/lib/timezone";

export type Attendee = {
  contact_id?: string | null;
  name: string;
  email?: string | null;
};

export type ActionItem = {
  title: string;
  done?: boolean;
};

export type EditableMeeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  location: string | null;
  link?: string | null;
  notes: string | null;
  preparation_needed: boolean | null;
  project_id?: string | null;
  meeting_type?: string | null;
  status?: string | null;
  attendees?: Attendee[] | null;
  summary?: string | null;
  transcript?: string | null;
  action_items?: ActionItem[] | null;
};

export type ProjectOption = { id: string; name: string; client_id?: string | null };
export type ContactOption = { id: string; name: string; email?: string | null };

const MEETING_TYPES = [
  { value: "in_person", label: "Presencial" },
  { value: "video", label: "Videollamada" },
  { value: "phone", label: "Llamada" },
];

const STATUSES = [
  { value: "scheduled", label: "Programada" },
  { value: "in_progress", label: "En curso" },
  { value: "done", label: "Finalizada" },
  { value: "cancelled", label: "Cancelada" },
];

export function EditMeetingModal({
  meeting,
  projects = [],
  contacts = [],
  onClose,
  onSaved,
}: {
  meeting: EditableMeeting;
  projects?: ProjectOption[];
  contacts?: ContactOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const userTimeZone = detectUserTimeZone();
  const [title, setTitle] = useState(meeting.title);
  const [datetime, setDatetime] = useState(toDateTimeLocalInput(meeting.datetime, userTimeZone));
  const [duration, setDuration] = useState<string>(meeting.duration_minutes?.toString() ?? "60");
  const [location, setLocation] = useState(meeting.location ?? "");
  const [link, setLink] = useState(meeting.link ?? "");
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [prep, setPrep] = useState(!!meeting.preparation_needed);
  const [projectId, setProjectId] = useState<string>(meeting.project_id ?? "");
  const [meetingType, setMeetingType] = useState<string>(meeting.meeting_type ?? "in_person");
  const [status, setStatus] = useState<string>(meeting.status ?? "scheduled");
  const [attendees, setAttendees] = useState<Attendee[]>(meeting.attendees ?? []);
  const [summary, setSummary] = useState(meeting.summary ?? "");
  const [actionItems, setActionItems] = useState<ActionItem[]>(meeting.action_items ?? []);
  const [saving, setSaving] = useState(false);
  const [media, setMedia] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedAttendees = useRef(false);

  // Pre-load attendees from project's client when project changes and no attendees yet
  useEffect(() => {
    if (initializedAttendees.current) return;
    if (attendees.length > 0) { initializedAttendees.current = true; return; }
    if (!projectId) return;
    const proj = projects.find((p) => p.id === projectId);
    if (!proj?.client_id) return;
    const client = contacts.find((c) => c.id === proj.client_id);
    if (client) {
      setAttendees([{ contact_id: client.id, name: client.name, email: client.email ?? null }]);
      initializedAttendees.current = true;
    }
  }, [projectId, projects, contacts, attendees.length]);

  // Load media list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const folder = `${uid}/${meeting.id}`;
      const { data } = await supabase.storage.from("meeting-media").list(folder, { limit: 100 });
      if (cancelled || !data) return;
      setMedia(data.filter((f) => f.name).map((f) => ({ name: f.name, path: `${folder}/${f.name}` })));
    })();
    return () => { cancelled = true; };
  }, [meeting.id]);

  const save = async () => {
    if (!title.trim() || !datetime) return;
    setSaving(true);
    await supabase
      .from("meetings")
      .update({
        title: title.trim(),
        datetime: localDateTimeToUTCISOString(datetime, userTimeZone),
        duration_minutes: duration ? parseInt(duration, 10) : null,
        location: location.trim() || null,
        link: link.trim() || null,
        notes: notes.trim() || null,
        preparation_needed: prep,
        project_id: projectId || null,
        meeting_type: meetingType,
        status,
        attendees: attendees as any,
        summary: summary.trim() || null,
        action_items: actionItems as any,
      } as any)
      .eq("id", meeting.id);
    setSaving(false);
    onSaved();
  };

  const remove = async () => {
    if (!confirm("¿Eliminar esta reunión?")) return;
    setSaving(true);
    await supabase.from("meetings").delete().eq("id", meeting.id);
    setSaving(false);
    onSaved();
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uid}/${meeting.id}/${Date.now()}_${safe}`;
      await supabase.storage.from("meeting-media").upload(path, file, { upsert: false });
    }
    const folder = `${uid}/${meeting.id}`;
    const { data } = await supabase.storage.from("meeting-media").list(folder, { limit: 100 });
    setMedia((data ?? []).filter((f) => f.name).map((f) => ({ name: f.name, path: `${folder}/${f.name}` })));
    setUploading(false);
  };

  const downloadMedia = async (path: string) => {
    const { data } = await supabase.storage.from("meeting-media").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  const removeMedia = async (path: string) => {
    if (!confirm("¿Eliminar este archivo?")) return;
    await supabase.storage.from("meeting-media").remove([path]);
    setMedia((prev) => prev.filter((m) => m.path !== path));
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f2f2f2" }}>Editar reunión</h2>
          <button onClick={onClose} style={{ color: "#666" }}><IconX size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} style={inputStyle}>
                {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Fecha y hora">
            <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} style={inputStyle} />
            <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
              Hora local: {formatDateTimeInTimeZone(meeting.datetime, userTimeZone)}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Duración (min)">
              <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Proyecto">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                <option value="">Sin proyecto</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>

          {meetingType !== "in_person" && (
            <Field label="Link">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/..." style={inputStyle} />
            </Field>
          )}
          {meetingType !== "video" && (
            <Field label="Ubicación">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Oficina, dirección…" style={inputStyle} />
            </Field>
          )}

          <Field label="Asistentes">
            <AttendeesEditor attendees={attendees} setAttendees={setAttendees} contacts={contacts} />
          </Field>

          <Field label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>

          {(status === "done" || summary || actionItems.length > 0) && (
            <>
              <Field label="Resumen">
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Resumen de la reunión…" style={{ ...inputStyle, resize: "vertical" }} />
              </Field>
              <Field label="Action items">
                <ActionItemsEditor items={actionItems} setItems={setActionItems} />
              </Field>
            </>
          )}

          <Field label="Archivos adjuntos">
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
              onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5"
              style={{ fontSize: 12, color: "#a78bfa", padding: "6px 10px", borderRadius: 8,
                border: "1px dashed rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)" }}>
              <IconPaperclip size={12} /> {uploading ? "Subiendo..." : "Adjuntar archivo"}
            </button>
            {media.length > 0 && (
              <ul style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {media.map((f) => (
                  <li key={f.path} className="flex items-center gap-2"
                    style={{ fontSize: 12, color: "#aaa", padding: "6px 8px",
                      background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 6 }}>
                    <span className="flex-1 truncate">{f.name.replace(/^\d+_/, "")}</span>
                    <button onClick={() => downloadMedia(f.path)} style={{ color: "#818cf8" }}><IconDownload size={13} /></button>
                    <button onClick={() => removeMedia(f.path)} style={{ color: "#f87171" }}><IconTrash size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <label className="flex items-center gap-2" style={{ fontSize: 13, color: "#888" }}>
            <input type="checkbox" checked={prep} onChange={(e) => setPrep(e.target.checked)} />
            Requiere preparación
          </label>
        </div>

        <div className="flex items-center justify-between mt-6">
          <button onClick={remove} disabled={saving} className="flex items-center gap-1.5"
            style={{ fontSize: 13, color: "#f87171", padding: "8px 12px", borderRadius: 8,
              border: "1px solid rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.08)" }}>
            <IconTrash size={14} /> Eliminar
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} style={{ fontSize: 13, color: "#888", padding: "8px 14px", borderRadius: 8, border: "1px solid #222", background: "transparent" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !title.trim() || !datetime}
              style={{ fontSize: 13, color: "#fff", fontWeight: 500, padding: "8px 14px", borderRadius: 8, background: "#6366f1", opacity: saving || !title.trim() || !datetime ? 0.5 : 1 }}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendeesEditor({
  attendees, setAttendees, contacts,
}: {
  attendees: Attendee[];
  setAttendees: (a: Attendee[]) => void;
  contacts: ContactOption[];
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const taken = new Set(attendees.map((a) => a.contact_id).filter(Boolean));
    return contacts
      .filter((c) => !taken.has(c.id))
      .filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q))
      .slice(0, 5);
  }, [query, contacts, attendees]);

  const addContact = (c: ContactOption) => {
    setAttendees([...attendees, { contact_id: c.id, name: c.name, email: c.email ?? null }]);
    setQuery(""); setAdding(false);
  };

  const addFree = () => {
    if (!query.trim()) return;
    setAttendees([...attendees, { name: query.trim() }]);
    setQuery(""); setAdding(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {attendees.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {attendees.map((a, i) => (
            <li key={i} className="flex items-center gap-1.5"
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 100,
                background: a.contact_id ? "rgba(99,102,241,0.12)" : "rgba(156,163,175,0.1)",
                border: `1px solid ${a.contact_id ? "rgba(99,102,241,0.3)" : "rgba(156,163,175,0.25)"}`,
                color: a.contact_id ? "#a5b4fc" : "#cbd5e1" }}>
              <IconUser size={11} />
              <span>{a.name}</span>
              <button onClick={() => setAttendees(attendees.filter((_, j) => j !== i))}
                style={{ color: "#888", marginLeft: 2 }}><IconX size={11} /></button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="relative">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFree(); } if (e.key === "Escape") { setAdding(false); setQuery(""); } }}
            placeholder="Buscar contacto o escribir nombre…" style={inputStyle} />
          {suggestions.length > 0 && (
            <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: "#0a0a0a", border: "1px solid #222", borderRadius: 8, zIndex: 10,
              maxHeight: 180, overflow: "auto" }}>
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button onClick={() => addContact(c)}
                    className="w-full text-left"
                    style={{ padding: "8px 10px", fontSize: 12, color: "#e0e0e0" }}>
                    {c.name}{c.email ? <span style={{ color: "#666", marginLeft: 6 }}>{c.email}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1"
          style={{ fontSize: 12, color: "#818cf8", padding: "4px 0" }}>
          <IconPlus size={12} /> Añadir asistente
        </button>
      )}
    </div>
  );
}

function ActionItemsEditor({
  items, setItems,
}: {
  items: ActionItem[];
  setItems: (i: ActionItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2"
              style={{ fontSize: 12, padding: "6px 8px", background: "#0a0a0a",
                border: "1px solid #1e1e1e", borderRadius: 6 }}>
              <input type="checkbox" checked={!!it.done}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...it, done: e.target.checked }; setItems(next);
                }} />
              <span className="flex-1" style={{ color: it.done ? "#555" : "#e0e0e0", textDecoration: it.done ? "line-through" : "none" }}>
                {it.title}
              </span>
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ color: "#666" }}>
                <IconX size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { e.preventDefault(); setItems([...items, { title: draft.trim() }]); setDraft(""); } }}
          placeholder="Nuevo action item…" style={inputStyle} />
        <button onClick={() => { if (draft.trim()) { setItems([...items, { title: draft.trim() }]); setDraft(""); } }}
          style={{ fontSize: 12, color: "#a78bfa", padding: "0 10px", borderRadius: 8,
            border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)" }}>
          <IconPlus size={12} />
        </button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 50, padding: 16, overflow: "auto",
};

const modalStyle: CSSProperties = {
  background: "#111", border: "1px solid #1e1e1e", borderRadius: 14,
  width: "100%", maxWidth: 520, padding: 24,
  maxHeight: "90vh", overflowY: "auto",
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  border: "1px solid #1e1e1e",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "#e0e0e0",
  outline: "none",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
