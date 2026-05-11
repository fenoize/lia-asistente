import { Link, useRouterState } from "@tanstack/react-router";
import { Calendar, CheckSquare, Home, MessageCircle, NotebookPen, Bell, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Hoy", icon: Home },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/tareas", label: "Tareas", icon: CheckSquare },
  { to: "/reuniones", label: "Reuniones", icon: Calendar },
  { to: "/recordatorios", label: "Recordatorios", icon: Bell },
  { to: "/notas", label: "Notas", icon: NotebookPen },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col surface-1 border-r border-border h-screen sticky top-0">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <span className="text-primary text-sm font-semibold">A</span>
          </div>
          <span className="text-sm font-medium tracking-tight">Alfred</span>
        </div>
      </div>

      <nav className="px-3 mt-2 flex-1 space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "pill flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2",
                active && "pill-active text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 border-t border-border pt-3 mx-2">
        <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
        <button
          onClick={() => signOut()}
          className="pill flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
