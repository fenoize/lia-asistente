import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  IconCurrencyDollar,
  IconReceipt,
  IconCreditCard,
  IconRepeat,
  IconBuildingBank,
  IconChartPie,
  IconPlus,
} from "@tabler/icons-react";

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

function FinanzasPage() {
  const [tab, setTab] = useState<Tab>("resumen");

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
          <button className="alfred-new-btn">
            <IconPlus size={14} stroke={2} /> Nuevo
          </button>
        )}
      </div>

      {/* Tabs */}
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
        <EmptyTab
          icon={<IconReceipt size={28} stroke={1.5} color="#444" />}
          title="Aún no hay cobros."
          subtitle="Registra facturas o cobros pendientes para llevarlos en una sola vista."
        />
      )}
      {tab === "gastos" && (
        <EmptyTab
          icon={<IconCreditCard size={28} stroke={1.5} color="#444" />}
          title="Sin gastos registrados."
          subtitle="Anota gastos por proyecto o personales para entender en qué se va el mes."
        />
      )}
      {tab === "subs" && (
        <EmptyTab
          icon={<IconRepeat size={28} stroke={1.5} color="#444" />}
          title="No tienes suscripciones."
          subtitle="Lleva control de cobros recurrentes para no llevarte sorpresas."
        />
      )}
      {tab === "cuentas" && (
        <EmptyTab
          icon={<IconBuildingBank size={28} stroke={1.5} color="#444" />}
          title="Sin cuentas configuradas."
          subtitle="Conecta tus cuentas bancarias o agrega saldos manualmente."
        />
      )}
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
        <IconChartPie
          size={28}
          stroke={1.5}
          color="#444"
          style={{ margin: "0 auto 12px" }}
        />
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

function EmptyTab({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className="text-center"
      style={{
        padding: "80px 24px",
        border: "1px dashed #1e1e1e",
        borderRadius: 14,
      }}
    >
      <div style={{ marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 14, color: "#888", maxWidth: 380, margin: "0 auto 6px" }}>{title}</p>
      <p style={{ fontSize: 12, color: "#444", maxWidth: 380, margin: "0 auto" }}>{subtitle}</p>
    </div>
  );
}

// Reuse currency icon import for sidebar consistency
void IconCurrencyDollar;
