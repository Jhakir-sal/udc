import { useState } from "react";
import { Phone, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

interface PhoneActionsProps {
  phoneNumber: string;
  contactName?: string;
  className?: string;
}

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function PhoneActions({ phoneNumber, contactName, className }: PhoneActionsProps) {
  const [showSms, setShowSms] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const { toast } = useToast();

  const digits = cleanPhone(phoneNumber);
  const telHref = `tel:${digits.length === 10 ? `+1${digits}` : `+${digits}`}`;

  const sendSmsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/send-sms", {
        to: phoneNumber,
        message: smsMessage,
        contactName: contactName || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Text message sent successfully" });
      setSmsMessage("");
      setShowSms(false);
    },
    onError: () => {
      toast({ title: "Failed to send text message", variant: "destructive" });
    },
  });

  if (!phoneNumber || digits.length < 10) return null;

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className || ""}`} onClick={(e) => e.stopPropagation()}>
      <a
        href={telHref}
        className="inline-flex items-center gap-1 text-primary hover:underline"
        title={`Call ${contactName || phoneNumber}`}
        data-testid={`link-call-${digits.slice(-4)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Phone className="h-3 w-3" />
        <span className="text-sm font-medium">{phoneNumber}</span>
      </a>
      <Popover open={showSms} onOpenChange={setShowSms}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title={`Text ${contactName || phoneNumber}`}
            data-testid={`button-text-${digits.slice(-4)}`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Send text to {contactName || phoneNumber}
            </p>
            <Textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              placeholder="Type your message..."
              className="min-h-[80px] text-sm"
              data-testid="textarea-sms-message"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSms(false)}
                data-testid="button-cancel-sms"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => sendSmsMutation.mutate()}
                disabled={!smsMessage.trim() || sendSmsMutation.isPending}
                data-testid="button-send-sms"
              >
                {sendSmsMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <MessageSquare className="h-3 w-3 mr-1" />
                )}
                Send
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
