import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Contact = { id: string; name: string; type: string };

export type EditableProject = {
  id: string;
  name: string;
  client_id: string | null;
  status: "active" | "paused" | "completed";
  due_date: string | null;
  budget: number | null;
  notes: string | null;
};

export function EditProjectModal({
  project,
  contacts,
  onClose,
  onSaved,
}: {
  project: EditableProject;
  contacts: Contact[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const clients = contacts.filter((c) => c.type === "client");
  const currencyMatch = project.notes?.match(/\[currency:(CLP|USD)\]/);
  const initialDescription = (project.notes ?? "").replace(/\n*\[currency:(CLP|USD)\]\n*/g, "").trim();

  const [name, setName] = useState(project.name);
  const [clientId, setClientId] = useState<string>(project.client_id ?? "");
  const [description, setDescription] = useState(initialDescription);
  const [dueDate, setDueDate] = useState(project.due_date ? project.due_date.slice(0, 10) : "");
  const [budget, setBudget] = useState(project.budget != null ? String(project.budget) : "");
  const [currency, setCurrency] = useState<"CLP" | "USD">(
    (currencyMatch?.[1] as "CLP" | "USD") ?? "CLP",
  );
  const [status, setStatus] = useState<"active" | "paused" | "completed">(project.status);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const budgetNum = budget.trim() ? Number(budget.replace(/[^\d.-]/g, "")) : null;
    const noteParts: string[] = [];
    if (description.trim()) noteParts.push(description.trim());
    if (budgetNum != null) noteParts.push(`[currency:${currency}]`);
    const { error } = await supabase
      .from("projects")
      .update({
        name: name.trim(),
        client_id: clientId || null,
        due_date: dueDate || null,
        budget: budgetNum,
        notes: noteParts.length ? noteParts.join("\n\n") : null,
        status,
      })
      .eq("id", project.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Guardado ✓");
      onSaved();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", marginBottom: 16 }}>
          Editar proyecto
        </h2>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Nombre del proyecto"
            className="w-full bg-transparent focus:outline-none"
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          />
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full focus:outline-none"
            style={{
              fontSize: 14,
              color: clientId ? "var(--text-primary)" : "var(--text-tertiary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          >
            <option value="">Sin cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={3}
            className="w-full bg-transparent focus:outline-none resize-none"
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-transparent focus:outline-none"
            style={{
              fontSize: 14,
              color: dueDate ? "var(--text-primary)" : "var(--text-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              colorScheme: "dark",
            }}
          />
          <div className="flex gap-2">
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Presupuesto"
              inputMode="decimal"
              className="flex-1 bg-transparent focus:outline-none"
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
              }}
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "CLP" | "USD")}
              className="focus:outline-none"
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
              }}
            >
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full focus:outline-none"
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          >
            <option value="active">Activo</option>
            <option value="paused">En pausa</option>
            <option value="completed">Completado</option>
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "7px 14px" }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            style={{
              background: "var(--accent-color)",
              color: "white",
              borderRadius: "var(--radius-pill)",
              padding: "7px 18px",
              fontSize: 13,
              fontWeight: 500,
              opacity: busy || !name.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
