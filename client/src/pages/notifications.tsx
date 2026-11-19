import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Bell, 
  FileCheck, 
  CheckCircle2, 
  Shield,
  Clock,
  CheckCheck,
  Filter,
  MailX,
  Mail,
  Send,
  Stethoscope,
  Heart
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { familyRefreshOptions } from "@/lib/family-refresh";
import { FamilyUpdateStatus } from "@/components/family-update-status";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import type { Notification } from "@shared/schema";

const typeIcons: Record<string, React.ElementType> = {
  certificate_uploaded: FileCheck,
  account_notified: Bell,
  action_taken: CheckCircle2,
  verification_complete: Shield,
  mail_service_initiated: MailX,
  mail_service_submitted: Mail,
  mail_service_completed: CheckCircle2,
  mail_service_status_change: MailX,
  government_notification: Send,
  credit_protection: Shield,
  credit_protection_initiated: Shield,
  credit_protection_status_change: Shield,
  healthcare_provider_notified: Stethoscope,
  family_added: Bell,
  payment_received: CheckCircle2,
  default: Bell,
};

const typeLabels: Record<string, string> = {
  certificate_uploaded: "Death certificate",
  account_notified: "Account or service",
  action_taken: "Case action",
  verification_complete: "Identity check",
  mail_service_initiated: "Mail Service",
  mail_service_submitted: "Mail Service",
  mail_service_completed: "Mail Service",
  mail_service_status_change: "Mail Service",
  government_notification: "Government update",
  credit_protection: "Credit report",
  credit_protection_initiated: "Credit report",
  credit_protection_status_change: "Credit report",
  healthcare_provider_notified: "Health care provider",
  family_added: "Account added",
  payment_received: "Payment",
};

function NotificationCard({ 
  notification, 
  onMarkRead 
}: { 
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const Icon = typeIcons[notification.type] || typeIcons.default;
  const isRead = !!notification.readAt;

  return (
    <Card 
      className={`hover-elevate transition-all duration-200 ${!isRead ? "border-primary/30 bg-primary/5" : ""}`}
      data-testid={`notification-card-${notification.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isRead ? "bg-muted" : "bg-primary/10"
          }`}>
            <Icon className={`h-5 w-5 ${isRead ? "text-muted-foreground" : "text-primary"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs" data-testid={`badge-notification-type-${notification.id}`}>
                    {typeLabels[notification.type] || notification.type}
                  </Badge>
                  {!isRead && (
                    <Badge className="bg-primary/20 text-primary text-xs" data-testid={`badge-notification-new-${notification.id}`}>
                      New
                    </Badge>
                  )}
                </div>
                <p className={`mt-2 ${isRead ? "text-muted-foreground" : "font-medium"}`} data-testid={`text-notification-message-${notification.id}`}>
                  {notification.message}
                </p>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(notification.sentAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              {!isRead && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onMarkRead(notification.id)}
                  data-testid={`button-mark-read-${notification.id}`}
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Mark as read
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Notifications() {
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const notificationQuery = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    ...(user?.role === "user" ? familyRefreshOptions : {}),
  });
  const { data: notifications, isLoading } = notificationQuery;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/notifications/${id}`, {
        readAt: new Date().toISOString()
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark notification as read.",
        variant: "destructive",
      });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notifications/mark-all-read", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "All notifications marked as read",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark all notifications as read.",
        variant: "destructive",
      });
    },
  });

  const filteredNotifications = notifications?.filter(notification => {
    const matchesType = typeFilter === "all" || notification.type === typeFilter;
    const matchesRead = readFilter === "all" || 
      (readFilter === "unread" && !notification.readAt) ||
      (readFilter === "read" && notification.readAt);
    return matchesType && matchesRead;
  }) || [];

  const unreadCount = notifications?.filter(n => !n.readAt).length || 0;

  const groupedNotifications = filteredNotifications.reduce((groups, notification) => {
    const date = new Date(notification.sentAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(notification);
    return groups;
  }, {} as Record<string, Notification[]>);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight">Case updates</h1>
          {user?.role === "user" && (
            <FamilyUpdateStatus className="mt-3" queries={[notificationQuery]} />
          )}
          <p className="text-muted-foreground mt-1">
            Read updates about your case in one place.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read ({unreadCount})
          </Button>
        )}
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-type-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Choose an update type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={readFilter} onValueChange={setReadFilter}>
              <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-read-filter">
                <SelectValue placeholder="Read status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : filteredNotifications.length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedNotifications).map(([date, dateNotifications]) => (
            <div key={date}>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">{date}</h2>
              <div className="space-y-3">
                {dateNotifications.map(notification => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onMarkRead={(id) => markAsRead.mutate(id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">No updates yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              {typeFilter !== "all" || readFilter !== "all"
                ? "Try adjusting your filters"
                : "When there is news about your case, you will see it here."
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
