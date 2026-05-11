import { createFileRoute } from "@tanstack/react-router";
import { IconCurrencyDollar } from "@tabler/icons-react";

export const Route = createFileRoute("/_app/finanzas")({
  component: FinanzasPage,
});

function FinanzasPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="alfred-h1">Finanzas</h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          Tu dinero, en una vista clara.
        </p>
      </header>

      <div
        className="text-center"
        style={{
          padding: "60px 24px",
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <IconCurrencyDollar
          size={28}
          stroke={1.5}
          color="var(--text-tertiary)"
          style={{ margin: "0 auto 12px" }}
        />
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            maxWidth: 360,
            margin: "0 auto",
            lineHeight: 1.5,
          }}
        >
          Pronto vas a poder llevar tus ingresos, gastos y proyecciones acá.
        </p>
      </div>
    </div>
  );
}
