import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  IconHome,
  IconCircleCheck,
  IconMenu2,
  IconPlus,
  IconMessageCircle,
  IconBriefcase,
  IconPencil,
  IconAddressBook,
  IconCurrencyDollar,
  IconCalendarEvent,
  IconBell,
  IconSettings,
  IconChevronRight,
  IconLogout,
} from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const menuItems = [
  { to: "/chat", label: "Chat con Lia", icon: IconMessageCircle },
  { to: "/meetings", label: "Reuniones", icon: IconCalendarEvent },
  { to: "/reminders", label: "Recordatorios", icon: IconBell },
  { to: "/projects", label: "Proyectos", icon: IconBriefcase },
  { to: "/notes", label: "Notas", icon: IconPencil },
  { to: "/contacts", label: "Contactos", icon: IconAddressBook },
  { to: "/finanzas", label: "Finanzas", icon: IconCurrencyDollar },
  { to: "/settings", label: "Configuración", icon: IconSettings },
] as const;

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          animation: "alfredQcIn 180ms ease",
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
        onTouchMove={(e) => {
          if (startY.current == null) return;
          const dy = e.touches[0].clientY - startY.current;
          if (dy > 0) setDragY(dy);
        }}
        onTouchEnd={() => {
          if (dragY > 80) onClose();
          setDragY(0);
          startY.current = null;
        }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "85vh",
          background: "#111111",
          borderRadius: "20px 20px 0 0",
          borderTop: "1px solid #1e1e1e",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? "transform 220ms cubic-bezier(.2,.8,.2,1)" : "none",
          animation: "alfredSheetIn 240ms cubic-bezier(.2,.8,.2,1)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: "#2a2a2a",
            borderRadius: 2,
            margin: "12px auto",
          }}
        />
        {children}
      </div>
    </div>
  );
}


function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 24px 20px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f2f2f2", marginBottom: 8 }}>
          Más opciones
        </h2>
        {user?.email && (
          <p style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>{user.email}</p>
        )}
        <div>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                onClick={() => {
                  onClose();
                  navigate({ to: item.to });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 0",
                  borderBottom: "1px solid #141414",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Icon size={20} stroke={1.75} color="#555" />
                <span style={{ flex: 1, fontSize: 15, color: "#ccc" }}>{item.label}</span>
                <IconChevronRight size={14} stroke={1.75} color="#2a2a2a" />
              </button>
            );
          })}
          <button
            onClick={async () => {
              onClose();
              await signOut();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 0",
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <IconLogout size={20} stroke={1.75} color="#555" />
            <span style={{ flex: 1, fontSize: 15, color: "#ccc" }}>Cerrar sesión</span>
            <IconChevronRight size={14} stroke={1.75} color="#2a2a2a" />
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const items = [
    { to: "/dashboard", label: "Inicio", icon: IconHome },
    { to: "/tasks", label: "Tareas", icon: IconCircleCheck },
    null, // center
    { to: "/chat", label: "Chat", icon: IconMessageCircle },
    { action: "menu" as const, label: "Menú", icon: IconMenu2 },
  ];

  return (
    <>
      <nav
        className="flex md:hidden"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          background: "#0a0a0a",
          borderTop: "1px solid #141414",
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 100,
          alignItems: "center",
          justifyContent: "space-around",
        }}
      >
        {items.map((item, idx) => {
          if (idx === 2) {
            return (
              <button
                key="center"
                onClick={() => setCaptureOpen(true)}
                aria-label="Capturar"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "#6366f1",
                  color: "white",
                  border: "none",
                  marginTop: -20,
                  boxShadow: "0 0 0 6px rgba(99,102,241,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "transform 100ms ease, background 150ms ease",
                }}
                onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.92)"; e.currentTarget.style.background = "#818cf8"; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "#6366f1"; }}
              >
                <IconPlus size={22} stroke={2} />
              </button>
            );
          }
          if (!item) return null;
          const Icon = item.icon;
          const active = "to" in item && (pathname === item.to || pathname.startsWith(item.to + "/"));
          const color = active ? "#818cf8" : "#444";

          const inner = (
            <>
              <Icon size={22} stroke={1.75} color={color} />
              <span style={{ fontSize: 10, color, fontWeight: 500 }}>{item.label}</span>
            </>
          );

          const baseStyle: React.CSSProperties = {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px 12px",
            transition: "transform 100ms ease",
          };

          if ("action" in item) {
            return (
              <button
                key="menu"
                onClick={() => setMenuOpen(true)}
                style={baseStyle}
                onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
                onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              preload="render"
              style={{ ...baseStyle, textDecoration: "none" }}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {inner}
            </Link>
          );
        })}
      </nav>

      <QuickCaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
