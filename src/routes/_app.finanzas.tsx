import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  IconCurrencyDollar,
  IconReceipt,
  IconCreditCard,
  IconRepeat,
  IconBuildingBank,
  IconChartPie,
  IconPlus,
  IconEye,
  IconEyeOff,
  IconCoin,
  IconTrendingUp,
  IconTrendingDown,
  IconWallet,
  IconClockHour4,
  IconAlertCircle,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { FinanceModal, type FinanceKind, type FinanceRecord } from "@/components/finanzas/finance-modal";
import { DebtModal, type DebtRecord } from "@/components/finanzas/debt-modal";
import { useHideAmounts } from "@/hooks/use-hide-amounts";

export const Route = createFileRoute("/_app/finanzas")({
  component: FinanzasPage,
});

type Tab = "resumen" | "cobros" | "gastos" | "subs" | "cuentas" | "deudas";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cobros", label: "Ingresos" },
  { id: "gastos", label: "Gastos" },
  { id: "subs", label: "Suscripciones" },
  { id: "cuentas", label: "Cuentas" },
  { id: "deudas", label: "Deudas" },
];

const TAB_TO_KIND: Record<Exclude<Tab, "resumen" | "deudas">, FinanceKind> = {
  cobros: "cobro",
  gastos: "gasto",
  subs: "sub",
  cuentas: "cuenta",
};

const TAB_TO_TABLE: Record<Exclude<Tab, "resumen">, string> = {
  cobros: "finance_incomes",
  gastos: "finance_expenses",
  subs: "finance_subscriptions",
  cuentas: "finance_accounts",
  deudas: "finance_debts",
};

function fmt(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: currency || "CLP", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

function FinanzasPage() {
  const [tab, setTab] = useState<Tab>("resumen");
  const [modalKind, setModalKind] = useState<FinanceKind | null>(null);
  const [modalRecord, setModalRecord] = useState<FinanceRecord | null>(null);
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtRecord, setDebtRecord] = useState<DebtRecord | null>(null);
  const { hidden, toggle, mask } = useHideAmounts();
  const [items, setItems] = useState<Record<string, FinanceRecord[]>>({
    cobros: [],
    gastos: [],
    subs: [],
    cuentas: [],
  });
  const [debts, setDebts] = useState<DebtRecord[]>([]);

  const loadAll = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const uid = u.user.id;
    const fetchTab = async (t: Exclude<Tab, "resumen" | "deudas">) => {
      const table = TAB_TO_TABLE[t];
      const { data } = await (supabase.from(table as never) as unknown as {
        select: (s: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: FinanceRecord[] | null }> } };
      }).select("*").eq("user_id", uid).order("created_at", { ascending: false });
      return [t, data ?? []] as const;
    };
    const fetchDebts = async () => {
      const { data } = await (supabase.from("finance_debts" as never) as unknown as {
        select: (s: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: DebtRecord[] | null }> } };
      }).select("*").eq("user_id", uid).order("created_at", { ascending: false });
      return data ?? [];
    };
    const [results, debtData] = await Promise.all([
      Promise.all([
        fetchTab("cobros"),
        fetchTab("gastos"),
        fetchTab("subs"),
        fetchTab("cuentas"),
      ]),
      fetchDebts(),
    ]);
    setItems(Object.fromEntries(results) as Record<string, FinanceRecord[]>);
    setDebts(debtData);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openNew = () => {
    if (tab === "resumen") return;
    if (tab === "deudas") {
      setDebtRecord(null);
      setDebtModalOpen(true);
      return;
    }
    setModalKind(TAB_TO_KIND[tab]);
    setModalRecord(null);
  };

  const openEdit = (kind: FinanceKind, rec: FinanceRecord) => {
    setModalKind(kind);
    setModalRecord(rec);
  };

  const openEditDebt = (rec: DebtRecord) => {
    setDebtRecord(rec);
    setDebtModalOpen(true);
  };

  const onSaved = async () => {
    setModalKind(null);
    setModalRecord(null);
    setDebtModalOpen(false);
    setDebtRecord(null);
    await loadAll();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="alfred-h1">Finanzas</h1>
          <p style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
            Tu dinero, en una vista clara.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            title={hidden ? "Mostrar montos" : "Ocultar montos"}
            style={{
              background: "transparent",
              border: "1px solid #222",
              borderRadius: 100,
              padding: 8,
              color: hidden ? "#818cf8" : "#666",
              display: "flex",
              alignItems: "center",
            }}
          >
            {hidden ? <IconEyeOff size={16} stroke={1.8} /> : <IconEye size={16} stroke={1.8} />}
          </button>
          {tab !== "resumen" && (
            <button className="alfred-new-btn" onClick={openNew}>
              <IconPlus size={14} stroke={2} /> Nuevo
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: active ? "rgba(99,102,241,0.15)" : "transparent",
                border: `1px solid ${active ? "rgba(99,102,241,0.3)" : "#222"}`,
                color: active ? "#818cf8" : "#555",
                borderRadius: 100,
                padding: "6px 16px",
                fontSize: 12,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "resumen" && (
        <ResumenTab
          incomes={items.cobros ?? []}
          expenses={items.gastos ?? []}
          accounts={items.cuentas ?? []}
          debts={debts}
          mask={mask}
        />
      )}

      {tab === "cobros" && (
        <ListOrEmpty
          rows={items.cobros ?? []}
          onClick={(r) => openEdit("cobro", r)}
          icon={<IconReceipt size={16} stroke={1.8} />}
          accent="#22c55e"
          empty={{
            icon: <IconReceipt size={28} stroke={1.5} color="#444" />,
            title: "Aún no hay ingresos.",
            subtitle: "Registra facturas o ingresos pendientes para llevarlos en una sola vista.",
          }}
          render={(r) => ({
            primary: r.description ?? "Sin descripción",
            secondary: [r.status === "paid" ? "Pagado" : r.status === "overdue" ? "Atrasado" : r.status === "cancelled" ? "Cancelado" : "Pendiente", r.due_date ? `vence ${r.due_date}` : null].filter(Boolean).join(" · "),
            amount: mask(fmt(r.amount, r.currency)),
            amountColor: r.status === "paid" ? "#22c55e" : r.status === "overdue" ? "#f87171" : "#e0e0e0",
          })}
        />
      )}

      {tab === "gastos" && (
        <ListOrEmpty
          rows={items.gastos ?? []}
          onClick={(r) => openEdit("gasto", r)}
          icon={<IconCreditCard size={16} stroke={1.8} />}
          accent="#f87171"
          empty={{
            icon: <IconCreditCard size={28} stroke={1.5} color="#444" />,
            title: "Sin gastos registrados.",
            subtitle: "Anota gastos por proyecto o personales para entender en qué se va el mes.",
          }}
          render={(r) => ({
            primary: r.description ?? "Sin descripción",
            secondary: [r.category, r.expense_date].filter(Boolean).join(" · "),
            amount: `− ${mask(fmt(r.amount, r.currency))}`,
            amountColor: "#f87171",
          })}
        />
      )}

      {tab === "subs" && (
        <ListOrEmpty
          rows={items.subs ?? []}
          onClick={(r) => openEdit("sub", r)}
          icon={<IconRepeat size={16} stroke={1.8} />}
          accent="#818cf8"
          empty={{
            icon: <IconRepeat size={28} stroke={1.5} color="#444" />,
            title: "No tienes suscripciones.",
            subtitle: "Lleva control de cobros recurrentes para no llevarte sorpresas.",
          }}
          render={(r) => ({
            primary: r.name ?? "Sin nombre",
            secondary: [r.frequency === "yearly" ? "Anual" : r.frequency === "weekly" ? "Semanal" : r.frequency === "quarterly" ? "Trimestral" : "Mensual", r.next_charge_date ? `próx. ${r.next_charge_date}` : null, r.active === false ? "Inactiva" : null].filter(Boolean).join(" · "),
            amount: mask(fmt(r.amount, r.currency)),
            amountColor: r.active === false ? "#666" : "#e0e0e0",
          })}
        />
      )}

      {tab === "cuentas" && (
        <ListOrEmpty
          rows={items.cuentas ?? []}
          onClick={(r) => openEdit("cuenta", r)}
          icon={<IconBuildingBank size={16} stroke={1.8} />}
          accent="#38bdf8"
          empty={{
            icon: <IconBuildingBank size={28} stroke={1.5} color="#444" />,
            title: "Sin cuentas configuradas.",
            subtitle: "Conecta tus cuentas bancarias o agrega saldos manualmente.",
          }}
          render={(r) => ({
            primary: r.name ?? "Sin nombre",
            secondary: r.type === "cash" ? "Efectivo" : r.type === "credit" ? "Tarjeta de crédito" : r.type === "savings" ? "Ahorros" : r.type === "other" ? "Otro" : "Banco",
            amount: mask(fmt(r.balance, r.currency)),
            amountColor: (Number(r.balance) || 0) < 0 ? "#f87171" : "#e0e0e0",
          })}
        />
      )}

      {tab === "deudas" && (
        <DebtsList debts={debts} onClick={openEditDebt} mask={mask} />
      )}

      {modalKind && (
        <FinanceModal
          kind={modalKind}
          record={modalRecord}
          onClose={() => { setModalKind(null); setModalRecord(null); }}
          onSaved={onSaved}
        />
      )}

      {debtModalOpen && (
        <DebtModal
          record={debtRecord}
          onClose={() => { setDebtModalOpen(false); setDebtRecord(null); }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function ListOrEmpty({
  rows,
  onClick,
  empty,
  render,
}: {
  rows: FinanceRecord[];
  onClick: (r: FinanceRecord) => void;
  empty: { icon: React.ReactNode; title: string; subtitle: string };
  render: (r: FinanceRecord) => { primary: string; secondary: string; amount: string };
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center" style={{ padding: "80px 24px", border: "1px dashed #1e1e1e", borderRadius: 14 }}>
        <div style={{ marginBottom: 12 }}>{empty.icon}</div>
        <p style={{ fontSize: 14, color: "#888", maxWidth: 380, margin: "0 auto 6px" }}>{empty.title}</p>
        <p style={{ fontSize: 12, color: "#444", maxWidth: 380, margin: "0 auto" }}>{empty.subtitle}</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => {
        const v = render(r);
        return (
          <button
            key={r.id}
            onClick={() => onClick(r)}
            style={{
              textAlign: "left",
              background: "#111111",
              border: "1px solid #1e1e1e",
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, color: "#f2f2f2", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.primary}
              </div>
              {v.secondary && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{v.secondary}</div>
              )}
            </div>
            <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 600, whiteSpace: "nowrap" }}>
              {v.amount}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DebtsList({
  debts,
  onClick,
  mask,
}: {
  debts: DebtRecord[];
  onClick: (r: DebtRecord) => void;
  mask: (s: string) => string;
}) {
  if (debts.length === 0) {
    return (
      <div className="text-center" style={{ padding: "80px 24px", border: "1px dashed #1e1e1e", borderRadius: 14 }}>
        <IconCoin size={28} stroke={1.5} color="#444" style={{ margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14, color: "#888", maxWidth: 380, margin: "0 auto 6px" }}>No tienes deudas registradas.</p>
        <p style={{ fontSize: 12, color: "#444", maxWidth: 380, margin: "0 auto" }}>
          Registra lo que debes a terceros y lleva el control de tus abonos.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {debts.map((d) => {
        const total = Number(d.total_amount ?? 0);
        const paid = Number(d.paid_amount ?? 0);
        const pending = Math.max(0, total - paid);
        const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
        const isPaid = d.status === "paid";
        return (
          <button
            key={d.id}
            onClick={() => onClick(d)}
            style={{
              textAlign: "left",
              background: "#111111",
              border: "1px solid #1e1e1e",
              borderRadius: 12,
              padding: "14px 16px",
              cursor: "pointer",
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 14, color: "#f2f2f2", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.creditor ?? "Sin nombre"}
                  </span>
                  {isPaid && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: "#4ade80",
                      background: "rgba(74,222,128,0.1)",
                      border: "1px solid rgba(74,222,128,0.25)",
                      borderRadius: 100, padding: "2px 8px", letterSpacing: "0.04em",
                    }}>
                      Saldada
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                  {mask(fmt(paid, d.currency))} de {mask(fmt(total, d.currency))}
                  {d.due_date ? ` · vence ${d.due_date}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.05em", textTransform: "uppercase" }}>Pendiente</div>
                <div style={{ fontSize: 14, color: isPaid ? "#666" : "#e0e0e0", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {mask(fmt(pending, d.currency))}
                </div>
              </div>
            </div>
            <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: isPaid ? "#4ade80" : "#6366f1",
                transition: "width 0.3s",
              }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ResumenTab({
  incomes,
  expenses,
  accounts,
  debts,
  mask,
}: {
  incomes: FinanceRecord[];
  expenses: FinanceRecord[];
  accounts: FinanceRecord[];
  debts: DebtRecord[];
  mask: (s: string) => string;
}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const inMonth = (iso?: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  // Cobros pagados este mes: usa paid_at si existe, sino due_date, sino mes actual.
  const incomeMonth = incomes
    .filter((r) => r.status === "paid")
    .filter((r) => {
      const ref = r.paid_at ?? r.due_date ?? null;
      if (!ref) return true; // sin fecha: cae en mes actual
      return inMonth(ref);
    })
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const expenseMonth = expenses
    .filter((r) => inMonth(r.expense_date ?? null))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const balance = accounts.reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const pending = incomes
    .filter((r) => r.status === "pending" || r.status === "overdue")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const debtsActive = debts
    .filter((d) => d.status === "active")
    .reduce((s, d) => s + Math.max(0, Number(d.total_amount ?? 0) - Number(d.paid_amount ?? 0)), 0);

  const currency =
    accounts[0]?.currency ?? incomes[0]?.currency ?? expenses[0]?.currency ?? "CLP";

  const cards = [
    { label: "INGRESOS DEL MES", value: mask(fmt(incomeMonth, currency)), hint: incomeMonth ? "Ingresos cobrados este mes" : "Sin ingresos cobrados" },
    { label: "GASTOS DEL MES", value: mask(fmt(expenseMonth, currency)), hint: expenseMonth ? "Total de gastos del mes" : "Sin gastos este mes" },
    { label: "BALANCE", value: mask(fmt(balance, currency)), hint: accounts.length ? `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"}` : "Configura cuentas para ver" },
    { label: "POR COBRAR", value: mask(fmt(pending, currency)), hint: pending ? "Ingresos pendientes" : "Sin ingresos pendientes" },
    { label: "DEUDAS ACTIVAS", value: mask(fmt(debtsActive, currency)), hint: debtsActive ? `${debts.filter((d) => d.status === "active").length} deuda${debts.filter((d) => d.status === "active").length === 1 ? "" : "s"} pendiente${debts.filter((d) => d.status === "active").length === 1 ? "" : "s"}` : "Sin deudas activas" },
  ];

  const hasData = incomes.length || expenses.length || accounts.length || debts.length;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: "#111111",
              border: "1px solid #1e1e1e",
              borderRadius: 12,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#555",
                marginBottom: 8,
              }}
            >
              {c.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#f2f2f2", letterSpacing: "-0.02em" }}>
              {c.value}
            </div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>{c.hint}</div>
          </div>
        ))}
      </div>

      {!hasData && (
        <>
          <div className="alfred-section-label">ESTE MES</div>
          <div
            className="text-center"
            style={{
              padding: "60px 24px",
              border: "1px dashed #1e1e1e",
              borderRadius: 14,
            }}
          >
            <IconChartPie size={28} stroke={1.5} color="#444" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, color: "#666", maxWidth: 380, margin: "0 auto 6px" }}>
              Aún no tienes datos financieros.
            </p>
            <p style={{ fontSize: 12, color: "#444", maxWidth: 380, margin: "0 auto" }}>
              Configura tus cuentas o registra un cobro para ver tu resumen mensual aquí.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

void IconCurrencyDollar;
