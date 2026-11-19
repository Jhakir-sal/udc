import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Loader2, Sparkles, Phone, Mail } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  showContact?: boolean;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hello, I’m Sally. I can help with signing in, uploading a document, or finding your next step. What would you like help with?",
};

const OPEN_SALLY_HELP = "sal:open-sally-help";

function useCaseHeaderHelp() {
  const [path] = useLocation();
  const { isAuthenticated } = useAuth();
  return (isAuthenticated && (path === "/admin" || path.startsWith("/admin/") || path === "/heartplans"))
    || path === "/heartplan-register"
    || (!isAuthenticated && path === "/heartplan");
}

export function CaseSallyHelpButton() {
  const show = useCaseHeaderHelp();
  if (!show) return null;
  return (
    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:w-auto sm:gap-2 sm:px-3"
      onClick={() => window.dispatchEvent(new Event(OPEN_SALLY_HELP))}
      aria-label="Ask Sally for help" data-testid="button-case-sally-help">
      <MessageCircle className="h-5 w-5" />
      <span className="hidden sm:inline">Sally help</span>
    </Button>
  );
}

export function SallyChat() {
  const hasHeaderHelp = useCaseHeaderHelp();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInputOnOpenRef = useRef(false);

  useEffect(() => {
    const openHelp = () => {
      focusInputOnOpenRef.current = true;
      setOpen(true);
    };
    window.addEventListener(OPEN_SALLY_HELP, openHelp);
    return () => window.removeEventListener(OPEN_SALLY_HELP, openHelp);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && focusInputOnOpenRef.current) inputRef.current?.focus();
    focusInputOnOpenRef.current = false;
  }, [open]);

  const chatMutation = useMutation({
    mutationFn: async (allMessages: ChatMessage[]) => {
      const res = await fetch("/api/sally/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: allMessages, currentPath: window.location.pathname }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sally is unavailable right now.");
      }
      return res.json() as Promise<{ reply: string; suggestContact?: boolean; contactPhone?: string | null; contactEmail?: string | null }>;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          showContact: !!data.suggestContact,
          contactPhone: data.contactPhone,
          contactEmail: data.contactEmail,
        },
      ]);
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: error.message + " You can also email help@stepsafterlife.com." },
      ]);
    },
  });

  const sendMessage = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    chatMutation.mutate(next);
  };

  return (
    <>
      {open && (
        <div
          className="fixed bottom-16 right-3 z-40 flex h-[min(340px,44dvh)] max-h-[calc(100dvh-5rem)] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-xl border bg-background shadow-2xl sm:bottom-20 sm:right-4 sm:h-[min(480px,65dvh)] sm:max-h-[calc(100dvh-7rem)]"
          data-testid="panel-sally-chat"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Sally</p>
                <p className="text-xs opacity-80 leading-tight">Here when you need help</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setOpen(false)}
              data-testid="button-sally-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-sally-${m.role}-${i}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
                {m.role === "assistant" && m.showContact && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {m.contactPhone && <>Call SAL at <span className="font-medium text-foreground">{m.contactPhone}</span> or </>}
                      email <span className="font-medium text-foreground">{m.contactEmail || "help@stepsafterlife.com"}</span>.
                    </p>
                    <div className="flex gap-2 justify-start">
                      {m.contactPhone && (
                        <Button asChild size="sm" variant="outline" className="gap-1.5" data-testid={`button-sally-call-${i}`}>
                          <a href={`tel:${m.contactPhone}`}>
                            <Phone className="h-3.5 w-3.5" />
                            Call SAL
                          </a>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline" className="gap-1.5" data-testid={`button-sally-email-${i}`}>
                        <a href={`mailto:${m.contactEmail || "help@stepsafterlife.com"}`}>
                          <Mail className="h-3.5 w-3.5" />
                          Email support
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-2 flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type your question"
              className="flex-1"
              data-testid="input-sally-message"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || chatMutation.isPending}
              data-testid="button-sally-send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {!hasHeaderHelp && <button
        onClick={() => {
          if (!open) focusInputOnOpenRef.current = true;
          setOpen((v) => !v);
        }}
        className="fixed bottom-3 right-3 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90 sm:bottom-4 sm:right-4 sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-3"
        data-testid="button-sally-toggle"
        aria-label={open ? "Close Sally help chat" : "Open Sally help chat"}
      >
        <MessageCircle className="h-5 w-5" />
        {!open && <span className="hidden text-sm font-medium sm:inline">Need help? Ask Sally</span>}
      </button>}
    </>
  );
}
