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
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { FinanceModal, type FinanceKind, type FinanceRecord } from "@/components/finanzas/finance-modal";

export const Route = createFileRoute("/_app/finanzas")({
  component: FinanzasPage,
});

type Tab = "resumen" | "cobros" | "gastos" | "subs" | "cuentas";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cobros", label: "Cobros" },
  { id: "gastos", label: "Gastos" },
  { id: "subs", label: "Suscripciones" },
  { id: "cuentas", label: "Cuentas" },
];

const TAB_TO_KIND: Record<Exclude<Tab, "resumen">, FinanceKind> = {
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
  const [items, setItems] = useState<Record<string, FinanceRecord[]>>({
    cobros: [],
    gastos: [],
    subs: [],
    cuentas: [],
  });

  const loadAll = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const uid = u.user.id;
    const fetchTab = async (t: Exclude<Tab, "resumen">) => {
      const table = TAB_TO_TABLE[t];
      const { data } = await (supabase.from(table as never) as unknown as {
        select: (s: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: FinanceRecord[] | null }> } };
      }).select("*").eq("user_id", uid).order("created_at", { ascending: false });
      return [t, data ?? []] as const;
    };
    const results = await Promise.all([
      fetchTab("cobros"),
      fetchTab("gastos"),
      fetchTab("subs"),
      fetchTab("cuentas"),
    ]);
    setItems(Object.fromEntries(results) as Record<string, FinanceRecord[]>);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openNew = () => {
    if (tab === "resumen") return;
    setModalKind(TAB_TO_KIND[tab]);
    setModalRecord(null);
  };

  const openEdit = (kind: FinanceKind, rec: FinanceRecord) => {
    setModalKind(kind);
    setModalRecord(rec);
  };

  const onSaved = async () => {
    setModalKind(null);
    setModalRecord(null);
    await load(tab);
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
        {tab !== "resumen" && (
          <button className="alfred-new-btn" onClick={openNew}>
            <IconPlus size={14} stroke={2} /> Nuevo
          </button>
        )}
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

      {tab === "resumen" && <ResumenTab />}

      {tab === "cobros" && (
        <ListOrEmpty
          rows={items.cobros ?? []}
          onClick={(r) => openEdit("cobro", r)}
          empty={{
            icon: <IconReceipt size={28} stroke={1.5} color="#444" />,
            title: "Aún no hay cobros.",
            subtitle: "Registra facturas o cobros pendientes para llevarlos en una sola vista.",
          }}
          render={(r) => ({
            primary: r.description ?? "Sin descripción",
            secondary: [r.status === "paid" ? "Pagado" : r.status === "overdue" ? "Atrasado" : r.status === "cancelled" ? "Cancelado" : "Pendiente", r.due_date ? `vence ${r.due_date}` : null].filter(Boolean).join(" · "),
            amount: fmt(r.amount, r.currency),
          })}
        />
      )}

      {tab === "gastos" && (
        <ListOrEmpty
          rows={items.gastos ?? []}
          onClick={(r) => openEdit("gasto", r)}
          empty={{
            icon: <IconCreditCard size={28} stroke={1.5} color="#444" />,
            title: "Sin gastos registrados.",
            subtitle: "Anota gastos por proyecto o personales para entender en qué se va el mes.",
          }}
          render={(r) => ({
            primary: r.description ?? "Sin descripción",
            secondary: [r.category, r.expense_date].filter(Boolean).join(" · "),
            amount: fmt(r.amount, r.currency),
          })}
        />
      )}

      {tab === "subs" && (
        <ListOrEmpty
          rows={items.subs ?? []}
          onClick={(r) => openEdit("sub", r)}
          empty={{
            icon: <IconRepeat size={28} stroke={1.5} color="#444" />,
            title: "No tienes suscripciones.",
            subtitle: "Lleva control de cobros recurrentes para no llevarte sorpresas.",
          }}
          render={(r) => ({
            primary: r.name ?? "Sin nombre",
            secondary: [r.frequency === "yearly" ? "Anual" : r.frequency === "weekly" ? "Semanal" : r.frequency === "quarterly" ? "Trimestral" : "Mensual", r.next_charge_date ? `próx. ${r.next_charge_date}` : null, r.active === false ? "Inactiva" : null].filter(Boolean).join(" · "),
            amount: fmt(r.amount, r.currency),
          })}
        />
      )}

      {tab === "cuentas" && (
        <ListOrEmpty
          rows={items.cuentas ?? []}
          onClick={(r) => openEdit("cuenta", r)}
          empty={{
            icon: <IconBuildingBank size={28} stroke={1.5} color="#444" />,
            title: "Sin cuentas configuradas.",
            subtitle: "Conecta tus cuentas bancarias o agrega saldos manualmente.",
          }}
          render={(r) => ({
            primary: r.name ?? "Sin nombre",
            secondary: r.type === "cash" ? "Efectivo" : r.type === "credit" ? "Tarjeta de crédito" : r.type === "savings" ? "Ahorros" : r.type === "other" ? "Otro" : "Banco",
            amount: fmt(r.balance, r.currency),
          })}
        />
      )}

      {modalKind && (
        <FinanceModal
          kind={modalKind}
          record={modalRecord}
          onClose={() => { setModalKind(null); setModalRecord(null); }}
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

function ResumenTab() {
  const cards: { label: string; value: string; hint: string }[] = [
    { label: "INGRESOS DEL MES", value: "—", hint: "Sin datos aún" },
    { label: "GASTOS DEL MES", value: "—", hint: "Sin datos aún" },
    { label: "BALANCE", value: "—", hint: "Configura cuentas para ver" },
    { label: "POR COBRAR", value: "—", hint: "Sin cobros pendientes" },
  ];

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
    </div>
  );
}

void IconCurrencyDollar;
