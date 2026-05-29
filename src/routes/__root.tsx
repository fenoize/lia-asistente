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
import { PushConsentModal } from "@/components/push-consent-modal";

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
      { name: "theme-color", content: "#080808" },
      { title: "LIA — Life Intelligence Assistant" },
      { name: "description", content: "Tu asistente ejecutiva personal." },
      { property: "og:title", content: "LIA — Life Intelligence Assistant" },
      { property: "og:description", content: "Tu asistente ejecutiva personal." },
      { name: "twitter:title", content: "LIA — Life Intelligence Assistant" },
      { name: "twitter:description", content: "Tu asistente ejecutiva personal." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/wVTlZ7C69hTXueuwzCN66OIBujU2/social-images/social-1780085078044-Captura_de_pantalla_2026-05-29_a_la(s)_4.04.29_p.m..webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/wVTlZ7C69hTXueuwzCN66OIBujU2/social-images/social-1780085078044-Captura_de_pantalla_2026-05-29_a_la(s)_4.04.29_p.m..webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://rsms.me/" },
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    scripts: [
      { src: "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js", defer: true },
      {
        type: "text/javascript",
        children: `window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function(OneSignal) {
  try {
    await OneSignal.init({
      appId: "9de4397a-f173-4215-a0e7-f89f49202f72",
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: "OneSignalSDKWorker.js",
      serviceWorkerParam: { scope: "/" },
      autoResubscribe: true,
    });
    console.log("[OneSignal] init OK", {
      permission: typeof Notification !== "undefined" ? Notification.permission : "n/a",
      optedIn: OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.optedIn,
      id: OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.id,
    });
  } catch (e) {
    console.error("[OneSignal] init failed", e);
  }
});`,
      },
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
        <PushConsentModal />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
