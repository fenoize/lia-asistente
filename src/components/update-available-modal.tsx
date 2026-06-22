import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePwaUpdate } from "@/hooks/use-pwa-update";

const DISMISS_KEY = "lia:update-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 6; // 6h

export function UpdateAvailableModal() {
  const { hasUpdate, forcing, forceUpdate } = usePwaUpdate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasUpdate) {
      setOpen(false);
      return;
    }
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const ts = raw ? Number(raw) : 0;
      if (ts && Date.now() - ts < DISMISS_TTL_MS) return;
    } catch {}
    setOpen(true);
  }, [hasUpdate]);

  const handleSkip = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setOpen(false);
  };

  const handleUpdate = async () => {
    await forceUpdate();
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Nueva versión disponible</AlertDialogTitle>
          <AlertDialogDescription>
            Hay una actualización lista para instalarse. Actualiza ahora para obtener
            las últimas mejoras y correcciones.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={forcing} onClick={handleSkip}>
            Omitir
          </AlertDialogCancel>
          <AlertDialogAction disabled={forcing} onClick={handleUpdate}>
            {forcing ? "Actualizando…" : "Actualizar ahora"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
