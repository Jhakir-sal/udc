import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AccountEmailIntake } from "@/components/account-email-intake";
import { shouldReadPastedAccounts } from "@shared/accountIntakeIntent";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sparkles,
  Send,
  Loader2,
  Paperclip,
  X,
  Copy,
  Check,
  FileText,
  ClipboardList,
  ListChecks,
  Mail,
  MessageSquareText,
  ClipboardPaste,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachmentName?: string;
}

const QUICK_ACTIONS = [
  { icon: ClipboardList, label: "Summarize case", prompt: "Give me a concise summary of this case: who the deceased is, current status, and where we are in the workflow." },
  { icon: ListChecks, label: "Next steps", prompt: "What are the recommended next steps for this case? Identify what's incomplete, what's blocking progress, and what I should do first." },
  { icon: Mail, label: "Draft family email", prompt: "Draft a compassionate email to the family's primary contact with a status update on this case." },
  { icon: MessageSquareText, label: "Draft SMS", prompt: "Draft a short, compassionate SMS to the family's primary contact with a brief status update on this case." },
];

function AssistantMessage({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };
  return (
    <div className="group relative rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap break-words" data-testid="message-assistant">
      {content}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copy}
        data-testid="button-copy-message"
      >
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export function ConciergeAssistant({ certId, deceasedName }: { certId: string; deceasedName: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "accounts">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [accountSource, setAccountSource] = useState("");
  const [accountSourceCaseId, setAccountSourceCaseId] = useState(certId);
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentCaseRef = useRef(certId);
  currentCaseRef.current = certId;

  useEffect(() => {
    setMessages([]);
    setInput("");
    setAttachment(null);
    setAccountSource("");
    setAccountSourceCaseId(certId);
    setMode("chat");
  }, [certId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, mode]);

  const askMutation = useMutation({
    mutationFn: async (payload: { caseId: string; messages: { role: string; content: string }[]; documentDataUrl?: string; documentName?: string }) => {
      const { caseId, ...requestPayload } = payload;
      const res = await apiRequest("POST", `/api/admin/case/${caseId}/assistant`, requestPayload);
      return res.json();
    },
    onSuccess: (data: { reply: string }, variables) => {
      if (variables.caseId !== currentCaseRef.current) return;
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: (err: any, variables) => {
      if (variables.caseId !== currentCaseRef.current) return;
      toast({
        title: "Assistant error",
        description: err.message || "Could not get a response. Please try again.",
        variant: "destructive",
      });
    },
  });

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || askMutation.isPending || mode !== "chat") return;
    if (!attachment && shouldReadPastedAccounts(trimmed)) {
      setAccountSource(trimmed);
      setAccountSourceCaseId(certId);
      setInput("");
      setMode("accounts");
      return;
    }
    const userMessage: ChatMessage = {
      role: "user",
      content: trimmed,
      attachmentName: attachment?.name,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    askMutation.mutate({
      caseId: certId,
      messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      documentDataUrl: attachment?.dataUrl,
      documentName: attachment?.name,
    });
    setAttachment(null);
  };

  const openAccountIntake = () => {
    if (attachment) return;
    setAccountSource(input);
    setAccountSourceCaseId(certId);
    setInput("");
    setMode("accounts");
  };

  const returnToChat = () => {
    setAccountSource("");
    setMode("chat");
  };

  const handleFile = (file: File) => {
    const supported = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!supported.includes(file.type)) {
      toast({ title: "Unsupported file", description: "Please attach a JPEG, PNG, GIF, WebP image, or PDF.", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please attach a file under 15 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => toast({ title: "Could not read file", variant: "destructive" });
    reader.readAsDataURL(file);
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setAccountSource("");
        setMode("chat");
      }
    }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-open-assistant">
          <Sparkles className="h-4 w-4 mr-2 text-primary" />
          AI Assistant
        </Button>
      </SheetTrigger>
      <SheetContent className="h-[100dvh] max-h-[100dvh] w-full sm:max-w-xl flex min-h-0 flex-col p-0">
        <SheetHeader className="shrink-0 px-4 pt-4 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Concierge Assistant
          </SheetTitle>
          <SheetDescription className="text-xs">
            Case-aware AI help for {deceasedName}. Summaries, next steps, drafts, and document analysis.
          </SheetDescription>
          <div className="flex justify-start pt-1">
            {mode === "chat" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={openAccountIntake}
                disabled={!!attachment}
                data-testid="button-assistant-read-accounts"
              >
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Read / add accounts
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={returnToChat} data-testid="button-assistant-back-to-chat">
                Back to chat
              </Button>
            )}
          </div>
          {mode === "chat" && attachment && (
            <p className="text-left text-xs text-muted-foreground">Remove the attached file before opening account intake. Your attachment will stay here.</p>
          )}
        </SheetHeader>

        {mode === "accounts" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4" data-testid="assistant-account-intake-mode">
            <AccountEmailIntake
              caseId={certId}
              caseName={deceasedName}
              initialText={accountSourceCaseId === certId ? accountSource : ""}
              autoAnalyze
            />
          </div>
        ) : (
        <>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="assistant-chat-mode">
          {messages.length === 0 && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Ask anything about this case, or start with a quick action:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((qa) => (
                  <Button
                    key={qa.label}
                    variant="outline"
                    size="sm"
                    className="h-auto py-2 justify-start text-left whitespace-normal"
                    onClick={() => sendMessage(qa.prompt)}
                    disabled={askMutation.isPending}
                    data-testid={`button-quick-${qa.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <qa.icon className="h-4 w-4 mr-2 shrink-0 text-primary" />
                    <span className="text-xs">{qa.label}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: attach a will, insurance policy, or statement with the paperclip and ask me to analyze it.
              </p>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="rounded-lg bg-primary text-primary-foreground p-3 text-sm max-w-[85%] whitespace-pre-wrap break-words" data-testid={`message-user-${i}`}>
                  {m.attachmentName && (
                    <div className="flex items-center gap-1 text-xs opacity-80 mb-1">
                      <FileText className="h-3 w-3" /> {m.attachmentName}
                    </div>
                  )}
                  {m.content}
                </div>
              </div>
            ) : (
              <AssistantMessage key={i} content={m.content} />
            )
          )}

          {askMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-assistant-thinking">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking...
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-4 py-3 space-y-2">
          {attachment && (
            <Badge variant="secondary" className="gap-1 max-w-full" data-testid="badge-attachment">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="ml-1" data-testid="button-remove-attachment">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
              data-testid="input-assistant-file"
            />
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-9 w-9 p-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={askMutation.isPending}
              data-testid="button-attach-document"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask about this case, request a draft..."
              className="min-h-[36px] max-h-32 resize-none text-sm"
              rows={1}
              data-testid="input-assistant-message"
            />
            <Button
              size="sm"
              className="shrink-0 h-9 w-9 p-0"
              onClick={() => sendMessage(input)}
              disabled={askMutation.isPending || !input.trim()}
              data-testid="button-send-assistant"
            >
              {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        </>
        )}
      </SheetContent>
    </Sheet>
  );
}
