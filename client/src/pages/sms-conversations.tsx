import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/utils";
import {
  MessageSquare,
  Phone,
  Send,
  ArrowLeft,
  User,
  Clock,
  Loader2,
  Search,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Conversation {
  phoneNumber: string;
  contactName: string | null;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
  certificateId: string | null;
  deceasedName: string | null;
}

interface SmsMessage {
  id: number;
  phoneNumber: string;
  contactName: string | null;
  direction: string;
  body: string;
  certificateId: string | null;
  adminUserId: string | null;
  adminName: string | null;
  status: string;
  createdAt: string;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SmsConversationsPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newConvoPhone, setNewConvoPhone] = useState("");
  const [newConvoName, setNewConvoName] = useState("");
  const [showNewConvo, setShowNewConvo] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const conversationsQuery = useQuery<Conversation[]>({
    queryKey: ["/api/admin/sms/conversations"],
    refetchInterval: 10000,
  });

  const threadQuery = useQuery<SmsMessage[]>({
    queryKey: ["/api/admin/sms/thread", selectedPhone],
    queryFn: async () => {
      const res = await fetch(`/api/admin/sms/thread/${encodeURIComponent(selectedPhone!)}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!selectedPhone,
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const targetPhone = showNewConvo ? newConvoPhone : selectedPhone!;
      const res = await apiRequest("POST", "/api/admin/send-sms", {
        to: targetPhone,
        message: newMessage,
        contactName: showNewConvo ? newConvoName : (conversationsQuery.data?.find(c => c.phoneNumber === selectedPhone)?.contactName || undefined),
      });
      return res.json();
    },
    onSuccess: () => {
      if (showNewConvo) {
        const digits = newConvoPhone.replace(/\D/g, "");
        const formatted = digits.length === 10 ? `+1${digits}` : `+${digits}`;
        setSelectedPhone(formatted);
        setShowNewConvo(false);
        setNewConvoPhone("");
        setNewConvoName("");
      }
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sms/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sms/thread", selectedPhone] });
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [threadQuery.data]);

  useEffect(() => {
    if (selectedPhone && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selectedPhone]);

  const conversations = conversationsQuery.data || [];
  const filtered = conversations.filter((c) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      c.phoneNumber.includes(q) ||
      (c.contactName || "").toLowerCase().includes(q)
    );
  });

  const selectedConvo = conversations.find((c) => c.phoneNumber === selectedPhone);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim() && !sendMutation.isPending) {
        sendMutation.mutate();
      }
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">
      {/* Conversation List (Left Panel) */}
      <div className={`${selectedPhone ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 lg:w-96 border-r bg-background`}>
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Text Messages
            </h2>
            <Button
              size="sm"
              onClick={() => { setShowNewConvo(true); setSelectedPhone(null); }}
              data-testid="button-new-conversation"
            >
              New
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {conversationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchFilter ? "No matching conversations" : "No conversations yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Send a text from any case to start
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((convo) => (
                <button
                  key={convo.phoneNumber}
                  onClick={() => { setSelectedPhone(convo.phoneNumber); setShowNewConvo(false); }}
                  className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                    selectedPhone === convo.phoneNumber ? "bg-muted" : ""
                  }`}
                  data-testid={`conversation-${convo.phoneNumber.replace(/\+/g, "")}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {convo.contactName || convo.phoneNumber}
                          {convo.deceasedName && (
                            <span className="text-muted-foreground font-normal"> — {convo.deceasedName.split(" ").pop()} family</span>
                          )}
                        </span>
                        {convo.unreadCount > 0 && (
                          <Badge className="h-5 min-w-[20px] flex items-center justify-center text-xs px-1.5 rounded-full">
                            {convo.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {convo.contactName && (
                        <p className="text-xs text-muted-foreground">{convo.phoneNumber}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {convo.lastMessage}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatTime(convo.lastAt)}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area (Right Panel) */}
      <div className={`${!selectedPhone && !showNewConvo ? "hidden md:flex" : "flex"} flex-col flex-1 bg-muted/20`}>
        {showNewConvo ? (
          <>
            <div className="p-4 border-b bg-background flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setShowNewConvo(false)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <MessageSquare className="h-5 w-5 text-primary" />
              <span className="font-semibold">New Conversation</span>
            </div>
            <div className="p-4 space-y-3 bg-background border-b">
              <Input
                placeholder="Phone number (e.g. 555-123-4567)"
                value={newConvoPhone}
                onChange={(e) => setNewConvoPhone(e.target.value)}
                data-testid="input-new-convo-phone"
              />
              <Input
                placeholder="Contact name (optional)"
                value={newConvoName}
                onChange={(e) => setNewConvoName(e.target.value)}
                data-testid="input-new-convo-name"
              />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Enter a phone number and type your message below</p>
            </div>
            <div className="p-4 border-t bg-background">
              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="min-h-[44px] max-h-[120px] resize-none"
                  data-testid="textarea-new-convo-message"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => sendMutation.mutate()}
                  disabled={!newMessage.trim() || !newConvoPhone.replace(/\D/g, "").length || sendMutation.isPending}
                  data-testid="button-send-new-convo"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : selectedPhone ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b bg-background flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedPhone(null)}
                data-testid="button-back-to-list"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {selectedConvo?.contactName || selectedPhone}
                    {selectedConvo?.deceasedName && (
                      <span className="text-muted-foreground font-normal"> — {selectedConvo.deceasedName.split(" ").pop()} family</span>
                    )}
                  </p>
                  {selectedConvo?.contactName && (
                    <p className="text-xs text-muted-foreground">{selectedPhone}</p>
                  )}
                </div>
              </div>
              <a href={`tel:${selectedPhone}`} title="Call">
                <Button variant="ghost" size="icon" data-testid="button-call-contact">
                  <Phone className="h-4 w-4" />
                </Button>
              </a>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {threadQuery.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (threadQuery.data?.length || 0) === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No messages yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-2xl mx-auto">
                  {threadQuery.data?.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${msg.id}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-background border rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                        <div className={`flex items-center gap-1.5 mt-1 ${
                          msg.direction === "outbound" ? "justify-end" : "justify-start"
                        }`}>
                          <Clock className="h-2.5 w-2.5 opacity-60" />
                          <span className="text-[10px] opacity-60">
                            {formatMessageTime(msg.createdAt)}
                          </span>
                          {msg.direction === "outbound" && msg.adminName && (
                            <span className="text-[10px] opacity-60">· {msg.adminName}</span>
                          )}
                          {msg.direction === "outbound" && msg.status === "failed" && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1">Failed</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t bg-background">
              <div className="flex gap-2 max-w-2xl mx-auto">
                <Textarea
                  ref={textareaRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="min-h-[44px] max-h-[120px] resize-none"
                  data-testid="textarea-chat-message"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => sendMutation.mutate()}
                  disabled={!newMessage.trim() || sendMutation.isPending}
                  data-testid="button-send-message"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              Select a conversation
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a contact from the list or start a new conversation
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
