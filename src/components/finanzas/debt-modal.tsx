import { useState, type CSSProperties, type ReactNode } from "react";
import { IconX, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";

export type DebtRecord = {
  id?: string;
  creditor?: string | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  currency?: string | null;
  due_date?: string | null;
  notes?: string | null;
  status?: string | null;
};

export function DebtModal({
  record,
  onClose,
  onSaved,
}: {
  record?: DebtRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!record?.id;
  const r = record ?? {};

  const [creditor, setCreditor] = useState<string>(r.creditor ?? "");
  const [totalAmount, setTotalAmount] = useState<string>(
    r.total_amount != null ? String(r.total_amount) : "",
  );
  const [currency, setCurrency] = useState<string>(r.currency ?? "CLP");
  const [payment, setPayment] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(r.due_date ?? "");
  const [notes, setNotes] = useState<string>(r.notes ?? "");
  const [saving, setSaving] = useState(false);

  const currentPaid = Number(r.paid_amount ?? 0);
  const canSave = creditor.trim() && totalAmount;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }

    const total = parseFloat(totalAmount) || 0;
    const addPayment = parseFloat(payment) || 0;
    const newPaid = currentPaid + addPayment;
    const status = newPaid >= total && total > 0 ? "paid" : "active";

    const payload: Record<string, unknown> = {
      creditor: creditor.trim(),
      total_amount: total,
      paid_amount: editing ? newPaid : addPayment,
      currency,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      status,
    };

    const tbl = supabase.from("finance_debts" as never) as unknown as {
      update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
      insert: (p: Record<string, unknown>) => Promise<unknown>;
    };
    if (editing && record?.id) {
      await tbl.update(payload).eq("id", record.id);
    } else {
      await tbl.insert({ ...payload, user_id: u.user.id });
    }
    setSaving(false);
    onSaved();
  };

  const remove = async () => {
    if (!record?.id) return;
    if (!confirm("¿Eliminar deuda?")) return;
    setSaving(true);
    await (supabase.from("finance_debts" as never) as unknown as {
      delete: () => { eq: (c: string, v: string) => Promise<unknown> };
    }).delete().eq("id", record.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111", border: "1px solid #1e1e1e", borderRadius: 14,
          width: "100%", maxWidth: 480, padding: 24, maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f2f2f2" }}>
            {editing ? "Editar deuda" : "Nueva deuda"}
          </h2>
          <button onClick={onClose} style={{ color: "#666" }}><IconX size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Acreedor">
            <input value={creditor} onChange={(e) => setCreditor(e.target.value)} placeholder="¿A quién le debes?" style={inputStyle} autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto total">
              <input type="number" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Moneda">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
              </select>
            </Field>
          </div>

          {editing && (
            <div style={{ fontSize: 12, color: "#888", padding: "8px 12px", background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 8 }}>
              Pagado hasta ahora: <strong style={{ color: "#e0e0e0" }}>{currentPaid} {currency}</strong>
            </div>
          )}

          <Field label={editing ? "Registrar abono" : "Abono inicial (opcional)"}>
            <input type="number" inputMode="decimal" value={payment} onChange={(e) => setPayment(e.target.value)} placeholder="0" style={inputStyle} />
          </Field>

          <Field label="Fecha límite (opcional)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
        </div>

        <div className="flex items-center justify-between mt-6">
          {editing ? (
            <button onClick={remove} disabled={saving} className="flex items-center gap-1.5"
              style={{ fontSize: 13, color: "#f87171", padding: "8px 12px", borderRadius: 8,
                border: "1px solid rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.08)" }}>
              <IconTrash size={14} /> Eliminar
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} style={{ fontSize: 13, color: "#888", padding: "8px 14px", borderRadius: 8, border: "1px solid #222", background: "transparent" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !canSave}
              style={{ fontSize: 13, color: "#fff", fontWeight: 500, padding: "8px 14px", borderRadius: 8, background: "#6366f1", opacity: saving || !canSave ? 0.5 : 1 }}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
