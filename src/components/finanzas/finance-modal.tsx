import { useState, type CSSProperties, type ReactNode } from "react";
import { IconX, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";

export type FinanceKind = "cobro" | "gasto" | "sub" | "cuenta";

export type FinanceRecord = {
  id?: string;
  // common
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  // cobro
  description?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  status?: string | null;
  // gasto
  category?: string | null;
  expense_date?: string | null;
  // sub
  name?: string | null;
  frequency?: string | null;
  next_charge_date?: string | null;
  active?: boolean | null;
  // cuenta
  type?: string | null;
  balance?: number | null;
};

const TABLE: Record<FinanceKind, string> = {
  cobro: "finance_incomes",
  gasto: "finance_expenses",
  sub: "finance_subscriptions",
  cuenta: "finance_accounts",
};

const TITLE: Record<FinanceKind, string> = {
  cobro: "cobro",
  gasto: "gasto",
  sub: "suscripción",
  cuenta: "cuenta",
};

export function FinanceModal({
  kind,
  record,
  onClose,
  onSaved,
}: {
  kind: FinanceKind;
  record?: FinanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!record?.id;
  const r = record ?? {};

  // Shared
  const [amount, setAmount] = useState<string>(r.amount != null ? String(r.amount) : "");
  const [currency, setCurrency] = useState<string>(r.currency ?? "CLP");
  const [notes, setNotes] = useState<string>(r.notes ?? "");

  // Cobro
  const [description, setDescription] = useState<string>(r.description ?? "");
  const [dueDate, setDueDate] = useState<string>(r.due_date ?? "");
  const [status, setStatus] = useState<string>(r.status ?? "pending");

  // Gasto
  const [category, setCategory] = useState<string>(r.category ?? "");
  const [expenseDate, setExpenseDate] = useState<string>(
    r.expense_date ?? new Date().toISOString().slice(0, 10),
  );

  // Sub
  const [name, setName] = useState<string>(r.name ?? "");
  const [frequency, setFrequency] = useState<string>(r.frequency ?? "monthly");
  const [nextCharge, setNextCharge] = useState<string>(r.next_charge_date ?? "");
  const [active, setActive] = useState<boolean>(r.active ?? true);

  // Cuenta
  const [accountType, setAccountType] = useState<string>(r.type ?? "bank");
  const [balance, setBalance] = useState<string>(r.balance != null ? String(r.balance) : "0");

  const [saving, setSaving] = useState(false);

  const canSave = (() => {
    if (kind === "cobro") return description.trim() && amount;
    if (kind === "gasto") return description.trim() && amount;
    if (kind === "sub") return name.trim() && amount;
    if (kind === "cuenta") return name.trim();
    return false;
  })();

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }

    let payload: Record<string, unknown> = {};
    if (kind === "cobro") {
      payload = {
        description: description.trim(),
        amount: parseFloat(amount) || 0,
        currency,
        due_date: dueDate || null,
        status,
        notes: notes.trim() || null,
      };
    } else if (kind === "gasto") {
      payload = {
        description: description.trim(),
        amount: parseFloat(amount) || 0,
        currency,
        category: category.trim() || null,
        expense_date: expenseDate,
        notes: notes.trim() || null,
      };
    } else if (kind === "sub") {
      payload = {
        name: name.trim(),
        amount: parseFloat(amount) || 0,
        currency,
        frequency,
        next_charge_date: nextCharge || null,
        active,
        notes: notes.trim() || null,
      };
    } else if (kind === "cuenta") {
      payload = {
        name: name.trim(),
        type: accountType,
        balance: parseFloat(balance) || 0,
        currency,
        notes: notes.trim() || null,
      };
    }

    const tbl = supabase.from(TABLE[kind] as never) as unknown as {
      update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
      insert: (p: Record<string, unknown>) => Promise<unknown>;
      delete: () => { eq: (c: string, v: string) => Promise<unknown> };
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
    if (!confirm(`¿Eliminar ${TITLE[kind]}?`)) return;
    setSaving(true);
    await supabase.from(TABLE[kind]).delete().eq("id", record.id);
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
            {editing ? "Editar" : "Nuevo"} {TITLE[kind]}
          </h2>
          <button onClick={onClose} style={{ color: "#666" }}><IconX size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          {(kind === "cobro" || kind === "gasto") && (
            <Field label="Descripción">
              <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} autoFocus />
            </Field>
          )}
          {(kind === "sub" || kind === "cuenta") && (
            <Field label="Nombre">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} autoFocus />
            </Field>
          )}

          {kind === "cuenta" && (
            <>
              <Field label="Tipo">
                <select value={accountType} onChange={(e) => setAccountType(e.target.value)} style={inputStyle}>
                  <option value="bank">Banco</option>
                  <option value="cash">Efectivo</option>
                  <option value="credit">Tarjeta de crédito</option>
                  <option value="savings">Ahorros</option>
                  <option value="other">Otro</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Saldo">
                  <input type="number" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Moneda">
                  <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} style={inputStyle} />
                </Field>
              </div>
            </>
          )}

          {kind !== "cuenta" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto">
                <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Moneda">
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} style={inputStyle} />
              </Field>
            </div>
          )}

          {kind === "cobro" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vencimiento">
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Estado">
                  <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                    <option value="pending">Pendiente</option>
                    <option value="paid">Pagado</option>
                    <option value="overdue">Atrasado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {kind === "gasto" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">
                <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Categoría">
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Comida, transporte..." style={inputStyle} />
              </Field>
            </div>
          )}

          {kind === "sub" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Frecuencia">
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle}>
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="weekly">Semanal</option>
                    <option value="quarterly">Trimestral</option>
                  </select>
                </Field>
                <Field label="Próximo cobro">
                  <input type="date" value={nextCharge} onChange={(e) => setNextCharge(e.target.value)} style={inputStyle} />
                </Field>
              </div>
              <label className="flex items-center gap-2" style={{ fontSize: 13, color: "#888" }}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Activa
              </label>
            </>
          )}

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
