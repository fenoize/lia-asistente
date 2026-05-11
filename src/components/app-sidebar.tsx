import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  IconHome,
  IconMessageCircle,
  IconCircleCheck,
  IconCalendarEvent,
  IconBell,
  IconPencil,
  IconPlus,
  IconLogout,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Hoy", icon: IconHome },
  { to: "/chat", label: "Chat", icon: IconMessageCircle },
  { to: "/tasks", label: "Tareas", icon: IconCircleCheck },
  { to: "/meetings", label: "Reuniones", icon: IconCalendarEvent },
  { to: "/reminders", label: "Recordatorios", icon: IconBell },
  { to: "/notes", label: "Notas", icon: IconPencil },
] as const;

function openQuickCapture() {
  window.dispatchEvent(new CustomEvent("alfred:quick-capture"));
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const initials = (user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div
      className="flex h-full w-[200px] flex-col"
      style={{
        background: "var(--bg-base)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Top: logo */}
      <div className="px-4 pt-5">
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded-[4px]"
            style={{ background: "var(--accent-color)" }}
          />
          <span
            className="text-[15px]"
            style={{
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            alfred
          </span>
        </div>
      </div>

      <div
        className="mt-[6px] mx-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      />

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 overflow-y-auto scrollbar-thin">
        <div
          className="px-3 mb-2"
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Espacio
        </div>

        <div className="space-y-0.5">
          {items.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center w-full transition-colors",
                  "no-underline",
                )}
                style={{
                  borderRadius: "var(--radius-pill)",
                  padding: "7px 12px",
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  color: active ? "var(--accent-color)" : "var(--text-secondary)",
                  background: active ? "var(--accent-subtle)" : "transparent",
                  border: active
                    ? "1px solid var(--accent-subtle)"
                    : "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                <Icon size={15} stroke={1.75} style={{ marginRight: 9 }} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-3">
        <button
          onClick={() => {
            onNavigate?.();
            openQuickCapture();
          }}
          className="flex items-center w-full transition-colors"
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "8px 12px",
            fontSize: 13,
            color: "var(--text-secondary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent-color)";
            e.currentTarget.style.borderColor = "var(--accent-color)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <IconPlus size={14} stroke={1.75} style={{ marginRight: 9 }} />
          <span>Captura rápida</span>
          <kbd
            className="ml-auto font-mono"
            style={{ fontSize: 10, color: "var(--text-tertiary)" }}
          >
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-2 px-1">
          <div
            className="flex items-center justify-center rounded-full shrink-0"
            style={{
              width: 28,
              height: 28,
              background: "var(--accent-subtle)",
              color: "var(--accent-color)",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {initials}
          </div>
          <span
            className="flex-1 truncate"
            style={{ fontSize: 12, color: "var(--text-secondary)" }}
          >
            {user?.email ?? "—"}
          </span>
          <button
            onClick={() => signOut()}
            aria-label="Cerrar sesión"
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
          >
            <IconLogout size={14} stroke={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        className="md:hidden fixed top-3 left-3 z-30 p-2 rounded-md"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        <IconMenu2 size={16} stroke={1.75} />
      </button>

      {/* Desktop */}
      <aside className="hidden md:block sticky top-0 h-screen shrink-0">
        <SidebarBody />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full">
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              className="absolute top-3 right-[-40px] p-2 rounded-md"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              <IconX size={16} stroke={1.75} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
