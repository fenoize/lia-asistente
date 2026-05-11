import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="mt-3 text-2xl font-semibold">Esto no existe</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no está aquí.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-[20px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo se cayó</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 inline-flex items-center justify-center rounded-[20px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0A0A0A" },
      { title: "Alfred — Tu asistente personal" },
      { name: "description", content: "Alfred es tu asistente ejecutivo con IA. Tareas, reuniones, recordatorios y notas — todo en un solo lugar, calmado y minimal." },
      { property: "og:title", content: "Alfred — Tu asistente personal" },
      { property: "og:description", content: "Alfred es tu asistente ejecutivo con IA. Tareas, reuniones, recordatorios y notas — todo en un solo lugar, calmado y minimal." },
      { name: "twitter:title", content: "Alfred — Tu asistente personal" },
      { name: "twitter:description", content: "Alfred es tu asistente ejecutivo con IA. Tareas, reuniones, recordatorios y notas — todo en un solo lugar, calmado y minimal." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ea35cc21-1026-4ace-a47a-0bdd57503eb1/id-preview-8c906bf2--5668d966-aa75-4a53-8287-eaf63792fcc7.lovable.app-1778475010053.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ea35cc21-1026-4ace-a47a-0bdd57503eb1/id-preview-8c906bf2--5668d966-aa75-4a53-8287-eaf63792fcc7.lovable.app-1778475010053.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://rsms.me/" },
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head><HeadContent /></head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
