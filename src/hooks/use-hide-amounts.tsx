import { useEffect, useState, useCallback } from "react";

const KEY = "lia.hide_amounts";
const EVT = "lia.hide_amounts.changed";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function useHideAmounts() {
  const [hidden, setHidden] = useState<boolean>(() => read());

  useEffect(() => {
    const onChange = () => setHidden(read());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const set = useCallback((value: boolean) => {
    window.localStorage.setItem(KEY, value ? "1" : "0");
    window.dispatchEvent(new Event(EVT));
    setHidden(value);
  }, []);

  const toggle = useCallback(() => set(!read()), [set]);

  const mask = useCallback(
    (formatted: string) => (hidden ? "••••••" : formatted),
    [hidden],
  );

  return { hidden, set, toggle, mask };
}
