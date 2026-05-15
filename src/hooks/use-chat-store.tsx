import { createContext, useContext, useRef, useState, type ReactNode } from "react";

export type ChatAction = {
  type: "task" | "meeting" | "reminder" | "note";
  title: string;
  description?: string | null;
  datetime?: string | null;
  priority?: "low" | "medium" | "high" | null;
  duration_minutes?: number | null;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: ChatAction | null;
  actionStatus?: "pending" | "accepted" | "declined";
  createdAt: number;
};

type ChatStore = {
  messages: ChatMsg[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  loadedForUser: React.MutableRefObject<string | null>;
};

const Ctx = createContext<ChatStore | null>(null);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const loadedForUser = useRef<string | null>(null);
  return (
    <Ctx.Provider value={{ messages, setMessages, loadedForUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChatStore(): ChatStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChatStore must be used inside ChatStoreProvider");
  return v;
}
