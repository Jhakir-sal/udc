import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";

interface SalNotification {
  id: number;
  type: string;
  userEmail: string | null;
  userName: string | null;
  caseId: string | null;
  deceasedName: string | null;
  payload: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  new_user: "New Signup",
  user_verified: "User Verified",
  new_task: "Family Request",
  task_update: "Task Updated",
  task_delete: "Task Removed",
};

const TYPE_COLORS: Record<string, string> = {
  new_user: "bg-[#577178] text-white",
  user_verified: "bg-[#32453A] text-white",
  new_task: "bg-[#956834] text-white",
  task_update: "bg-[#577178] text-white",
  task_delete: "bg-red-600 text-white",
};

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDescription(n: SalNotification) {
  let payload: any = {};
  try {
    payload = n.payload ? JSON.parse(n.payload) : {};
  } catch {
    payload = {};
  }
  const name = n.userName || n.userEmail || "Unknown";
  switch (n.type) {
    case "new_user":
      return `${name} created a Steps After Life account`;
    case "user_verified": {
      const cases = payload?.cases || [];
      const caseNames = cases.map((c: any) => c.deceasedName).join(", ");
      return `${name} logged in — verified case${cases.length > 1 ? "s" : ""}: ${caseNames || "N/A"}`;
    }
    case "new_task":
      return `${name} needs help: "${payload?.task?.title || "task"}" (${n.deceasedName || "Unknown"})`;
    case "task_update":
      return `${name} marked "${payload?.task?.title || "task"}" as ${payload?.task?.status || "updated"} (${n.deceasedName || "Unknown"})`;
    case "task_delete":
      return `${name} removed task #${payload?.taskId || "?"} (${n.deceasedName || "Unknown"})`;
    default:
      return n.type;
  }
}

export function SalNotifications() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/sal-notifications/unread-count"],
    refetchInterval: 900000,
  });

  const { data: notifications } = useQuery<SalNotification[]>({
    queryKey: ["/api/sal-notifications"],
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/sal-notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sal-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sal-notifications/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-sal-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white" data-testid="badge-sal-unread-count">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="border-b px-4 py-3">
          <h4 className="font-serif font-semibold text-sm text-[#32453A] dark:text-[#D6CDB3]" data-testid="text-sal-notifications-title">
            SAL Notifications
          </h4>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground" data-testid="text-sal-no-notifications">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
                className={`border-b px-4 py-3 last:border-b-0 transition-colors ${
                  n.isRead
                    ? "bg-background"
                    : "bg-muted/40 cursor-pointer hover:bg-muted/60"
                }`}
                data-testid={`sal-notification-${n.id}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    className={`text-[10px] uppercase tracking-wide ${TYPE_COLORS[n.type] || "bg-muted text-foreground"}`}
                    data-testid={`badge-sal-type-${n.id}`}
                  >
                    {TYPE_LABELS[n.type] || n.type}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {formatTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed" data-testid={`text-sal-description-${n.id}`}>
                  {getDescription(n)}
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
