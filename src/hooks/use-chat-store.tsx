import { createContext, useContext, useRef, useState, type ReactNode } from "react";

export type ChatAction = {
  type: "task" | "meeting" | "reminder" | "note" | "bulk" | "task_update";
  title: string;
  description?: string | null;
  datetime?: string | null;
  priority?: "low" | "medium" | "high" | null;
  duration_minutes?: number | null;
  project_id?: string | null;
  project_name?: string | null;
  task_id?: string | null;
  new_title?: string | null;
  items?: ChatAction[];
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
  hasMore: boolean;
  setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  contextRef: React.MutableRefObject<any>;
};

const Ctx = createContext<ChatStore | null>(null);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [name, setName] = useState("");
  const loadedForUser = useRef<string | null>(null);
  const contextRef = useRef<any>({});
  return (
    <Ctx.Provider value={{ messages, setMessages, loadedForUser, hasMore, setHasMore, name, setName, contextRef }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChatStore(): ChatStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChatStore must be used inside ChatStoreProvider");
  return v;
}
