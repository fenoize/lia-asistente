import { createContext, useContext, useRef, useState, type ReactNode } from "react";

export type PrefetchedData = {
  tasks: any[];
  meetings: any[];
  reminders: any[];
  projects: { id: string; name: string }[];
} | null;

type PrefetchStore = {
  data: PrefetchedData;
  setData: (d: PrefetchedData) => void;
  prefetchedUsers: React.MutableRefObject<Set<string>>;
};

const Ctx = createContext<PrefetchStore | null>(null);

export function PrefetchStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PrefetchedData>(null);
  const prefetchedUsers = useRef<Set<string>>(new Set());
  return (
    <Ctx.Provider value={{ data, setData, prefetchedUsers }}>{children}</Ctx.Provider>
  );
}

export function usePrefetchStore(): PrefetchStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefetchStore must be used inside PrefetchStoreProvider");
  return v;
}
