import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

type Msg = { id: string; role: "user" | "assistant"; content: string };

function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(50);
      if (data) setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content })));
    })();
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async () => {
    if (!input.trim() || !user || streaming) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    // Persist user msg
    supabase.from("chat_messages").insert({ user_id: user.id, role: "user", content: userMsg.content });

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error("AI error");

      const assistantId = crypto.randomUUID();
      setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, content: acc } : msg));
      }
      supabase.from("chat_messages").insert({ user_id: user.id, role: "assistant", content: acc });
    } catch (e: any) {
      toast.error("Alfred no pudo responder.");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto w-full">
      <header className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Alfred
        </div>
        <h1 className="mt-1 text-lg font-medium">Conversación</h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
        {messages.length === 0 && !streaming && (
          <div className="text-center mt-20 text-muted-foreground">
            <p className="text-sm">Pregúntame lo que quieras. Sé directo.</p>
          </div>
        )}
        <div className="space-y-6">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "surface-1 hairline text-foreground"
              }`}>
                {m.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5">
                    <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}
          {streaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div className="surface-1 hairline rounded-2xl px-4 py-3">
                <TypingDots />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border">
        <div className="flex items-end gap-2 surface-1 hairline rounded-2xl px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribe tu mensaje…"
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm focus:outline-none py-2 max-h-32"
          />
          <Button
            size="icon"
            onClick={send}
            disabled={streaming || !input.trim()}
            className="h-9 w-9 rounded-xl shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
    </div>
  );
}
