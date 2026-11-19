import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Building2,
  Users,
  Calendar,
  Shield,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Send,
  Baby,
  Heart,
  User,
  Phone,
  Mail,
  MapPin,
  Video,
  FileText,
  XOctagon,
  HelpCircle,
  CreditCard,
  ExternalLink,
  MailX,
  Ban,
  HandHeart
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { 
  Beneficiary, 
  Appointment, 
  GovernmentNotification,
  Certificate,
  CreditProtectionRequest,
  MailServiceRequest
} from "@shared/schema";

const agencyLabels: Record<string, string> = {
  ssa: "Social Security Administration",
  va: "Veterans Affairs",
  medicare: "Medicare",
  medicaid: "Medicaid",
  irs: "Internal Revenue Service",
  state_benefits: "State Benefits Office",
  other: "Other Agency"
};

const agencyIcons: Record<string, React.ElementType> = {
  ssa: Building2,
  va: Shield,
  medicare: Heart,
  medicaid: Heart,
  irs: FileText,
  state_benefits: Building2,
  other: Building2
};

const statusColors: Record<string, string> = {
  pending: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  successful: "bg-green-500/10 text-green-700 dark:text-green-400",
  not_completed: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  unsuccessful: "bg-red-500/10 text-red-700 dark:text-red-400",
  not_applicable: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  identified: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  verified: "bg-green-500/10 text-green-700 dark:text-green-400",
  benefits_pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  benefits_active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  benefits_denied: "bg-red-500/10 text-red-700 dark:text-red-400",
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  confirmed: "bg-green-500/10 text-green-700 dark:text-green-400",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  no_show: "bg-red-500/10 text-red-700 dark:text-red-400",
  pending_approval: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  approved: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  in_progress: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  submitted: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-400",
};

const bureauLabels: Record<string, string> = {
  experian: "Experian",
  equifax: "Equifax",
  transunion: "TransUnion",
};

const bureauUrls: Record<string, string> = {
  experian: "https://www.experian.com/consumer/upload/",
  equifax: "https://www.equifax.com/personal/credit-report-services/report-death/",
  transunion: "https://www.transunion.com/customer-support/report-death",
};

const mailServiceLabels: Record<string, string> = {
  usps_mail_stop: "USPS Mail Stop",
  dnc_marketing: "Marketing Do Not Contact",
};

const mailServiceUrls: Record<string, string> = {
  usps_mail_stop: "https://www.usps.com/manage/mail-for-deceased.htm",
  dnc_marketing: "https://www.ims-dm.com/cgi/ddnc.php",
};

const mailServiceDescriptions: Record<string, string> = {
  usps_mail_stop: "Manage the deceased's mail through USPS — forward mail to an executor, stop mail delivery, and remove them from mailing lists.",
  dnc_marketing: "Remove the deceased from marketing mailing lists through the Deceased Do Not Contact (DNC) registry.",
};

const statusIcons: Record<string, React.ElementType> = {
  pending: Clock,
  successful: CheckCircle,
  not_completed: HelpCircle,
  unsuccessful: XOctagon,
  not_applicable: XOctagon,
};

const relationshipIcons: Record<string, React.ElementType> = {
  spouse: Heart,
  child: Baby,
  dependent: User,
  other: Users,
};

function BeneficiaryCard({ beneficiary }: { beneficiary: Beneficiary }) {
  const Icon = relationshipIcons[beneficiary.relationship] || Users;
  
  return (
    <Card className="hover-elevate" data-testid={`beneficiary-card-${beneficiary.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium truncate" data-testid={`text-beneficiary-name-${beneficiary.id}`}>
                {beneficiary.fullName}
              </h3>
              <Badge className={statusColors[beneficiary.status]} data-testid={`badge-beneficiary-status-${beneficiary.id}`}>
                {beneficiary.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground capitalize mt-1">
              {beneficiary.relationship}
              {beneficiary.isMinor && " (Minor)"}
            </p>
            
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              {beneficiary.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {beneficiary.email}
                </span>
              )}
              {beneficiary.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {beneficiary.phone}
                </span>
              )}
            </div>

            {beneficiary.eligibleBenefits && beneficiary.eligibleBenefits.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {beneficiary.eligibleBenefits.map((benefit, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {benefit}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const Icon = agencyIcons[appointment.agency] || Building2;
  
  return (
    <Card className="hover-elevate" data-testid={`appointment-card-${appointment.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            {appointment.isVirtual ? (
              <Video className="h-5 w-5 text-primary" />
            ) : (
              <Icon className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium truncate">
                {agencyLabels[appointment.agency]}
              </h3>
              <Badge className={statusColors[appointment.status]}>
                {appointment.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {appointment.appointmentType}
            </p>
            
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {new Date(appointment.scheduledDate).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {appointment.scheduledTime}
              </span>
              {appointment.isVirtual && appointment.meetingLink && (
                <a 
                  href={appointment.meetingLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <Video className="h-4 w-4" />
                  Join Meeting
                </a>
              )}
              {!appointment.isVirtual && appointment.location && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {appointment.location}
                </span>
              )}
            </div>

            {appointment.confirmationNumber && (
              <p className="text-xs text-muted-foreground mt-2">
                Confirmation: {appointment.confirmationNumber}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GovernmentNotificationCard({ notification }: { notification: GovernmentNotification }) {
  const Icon = agencyIcons[notification.agency] || Building2;
  const StatusIcon = statusIcons[notification.status] || Clock;
  
  return (
    <Card className="hover-elevate" data-testid={`gov-notification-card-${notification.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium truncate">
                {agencyLabels[notification.agency]}
              </h3>
              <Badge className={statusColors[notification.status]}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {notification.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {notification.notificationType}
            </p>
            
            {notification.benefitsAffected && notification.benefitsAffected.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {notification.benefitsAffected.map((benefit, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {benefit}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>Ref: {notification.referenceNumber}</span>
              <span>{new Date(notification.sentAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreditProtectionCard({ 
  request, 
  onUpdateStatus,
  certificate
}: { 
  request: CreditProtectionRequest;
  onUpdateStatus: (id: string, status: string) => void;
  certificate?: Certificate;
}) {
  const handleVisitBureau = () => {
    const url = bureauUrls[request.bureau];
    if (url) {
      window.open(url, '_blank');
      if (request.status === 'approved') {
        onUpdateStatus(request.id, 'in_progress');
      }
    }
  };

  return (
    <Card className="hover-elevate" data-testid={`credit-protection-card-${request.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium truncate">
                {bureauLabels[request.bureau] || request.bureau}
              </h3>
              <Badge className={statusColors[request.status]}>
                {request.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Credit protection for deceased: {certificate?.deceasedName || 'Loading...'}
            </p>
            
            {request.status === 'pending_approval' && (
              <div className="flex gap-2 mt-3">
                <Button 
                  size="sm" 
                  onClick={() => onUpdateStatus(request.id, 'approved')}
                  data-testid={`button-approve-${request.id}`}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onUpdateStatus(request.id, 'rejected')}
                  data-testid={`button-reject-${request.id}`}
                >
                  <XOctagon className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}
            
            {request.status === 'approved' && (
              <div className="mt-3">
                <Button 
                  size="sm" 
                  onClick={handleVisitBureau}
                  data-testid={`button-visit-bureau-${request.id}`}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Visit {bureauLabels[request.bureau]} Website
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Opens the official credit bureau website to submit death notification
                </p>
              </div>
            )}
            
            {request.status === 'in_progress' && (
              <div className="mt-3">
                <Button 
                  size="sm" 
                  onClick={() => onUpdateStatus(request.id, 'submitted')}
                  data-testid={`button-mark-submitted-${request.id}`}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Mark as Submitted
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="ml-2"
                  onClick={handleVisitBureau}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Revisit Website
                </Button>
              </div>
            )}
            
            {request.status === 'submitted' && (
              <div className="mt-3">
                <Button 
                  size="sm" 
                  onClick={() => onUpdateStatus(request.id, 'completed')}
                  data-testid={`button-mark-completed-${request.id}`}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Mark as Completed
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>Created: {new Date(request.createdAt).toLocaleDateString()}</span>
              {request.completedAt && (
                <span>Completed: {new Date(request.completedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MailServiceCard({ 
  request, 
  onUpdateStatus,
  certificate
}: { 
  request: MailServiceRequest;
  onUpdateStatus: (id: string, status: string) => void;
  certificate?: Certificate;
}) {
  const handleVisitService = () => {
    const url = mailServiceUrls[request.serviceType];
    if (url) {
      window.open(url, '_blank');
      if (request.status === 'pending') {
        onUpdateStatus(request.id, 'submitted');
      }
    }
  };

  const Icon = request.serviceType === 'usps_mail_stop' ? MailX : Ban;

  return (
    <Card className="hover-elevate" data-testid={`mail-service-card-${request.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium truncate">
                {mailServiceLabels[request.serviceType] || request.serviceType}
              </h3>
              <Badge className={statusColors[request.status]}>
                {request.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {mailServiceDescriptions[request.serviceType]}
            </p>
            
            {request.status === 'pending' && (
              <div className="mt-3">
                <Button 
                  size="sm" 
                  onClick={handleVisitService}
                  data-testid={`button-visit-service-${request.id}`}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Visit {request.serviceType === 'usps_mail_stop' ? 'USPS' : 'DNC Registry'}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Opens the official website to submit your request
                </p>
              </div>
            )}
            
            {request.status === 'submitted' && (
              <div className="mt-3">
                <Button 
                  size="sm" 
                  onClick={() => onUpdateStatus(request.id, 'processing')}
                  data-testid={`button-mark-processing-${request.id}`}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Mark as Processing
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="ml-2"
                  onClick={handleVisitService}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Revisit Website
                </Button>
              </div>
            )}
            
            {request.status === 'processing' && (
              <div className="mt-3">
                <Button 
                  size="sm" 
                  onClick={() => onUpdateStatus(request.id, 'completed')}
                  data-testid={`button-mark-completed-${request.id}`}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Mark as Completed
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>Created: {new Date(request.createdAt).toLocaleDateString()}</span>
              {request.completedAt && (
                <span>Completed: {new Date(request.completedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Benefits() {
  const { toast } = useToast();
  const [showAddBeneficiary, setShowAddBeneficiary] = useState(false);
  const [showScheduleAppointment, setShowScheduleAppointment] = useState(false);
  const [showCreditProtection, setShowCreditProtection] = useState(false);
  const [showMailService, setShowMailService] = useState(false);
  const [selectedBureau, setSelectedBureau] = useState<string>("experian");
  const [selectedMailService, setSelectedMailService] = useState<string>("usps_mail_stop");
  const [newBeneficiary, setNewBeneficiary] = useState({
    fullName: "",
    relationship: "spouse" as const,
    email: "",
    phone: "",
    isMinor: false,
  });
  const [newAppointment, setNewAppointment] = useState({
    agency: "ssa" as const,
    appointmentType: "Benefits Consultation",
    scheduledDate: "",
    scheduledTime: "",
    isVirtual: false,
    location: "",
  });

  const { data: certificates, isLoading: certificatesLoading } = useQuery<Certificate[]>({
    queryKey: ["/api/certificates"],
  });

  const selectedCaseId = (() => {
    try {
      const sel = localStorage.getItem("sal-selected-case");
      if (sel && sel !== "all" && certificates?.some(c => c.id === sel)) return sel;
    } catch {}
    return undefined;
  })();
  const selectedCertificate = certificates?.find(c => c.id === selectedCaseId) || certificates?.[0];
  const certificateId = selectedCertificate?.id;

  const { data: beneficiaries, isLoading: beneficiariesLoading, refetch: refetchBeneficiaries } = useQuery<Beneficiary[]>({
    queryKey: ["/api/beneficiaries"],
  });

  const { data: appointments, isLoading: appointmentsLoading, refetch: refetchAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: govNotifications, isLoading: govLoading, refetch: refetchGovNotifications } = useQuery<GovernmentNotification[]>({
    queryKey: ["/api/government-notifications"],
  });

  const { data: creditProtectionRequests, isLoading: creditLoading, refetch: refetchCreditProtection } = useQuery<CreditProtectionRequest[]>({
    queryKey: ["/api/credit-protection"],
  });

  const createCreditProtectionMutation = useMutation({
    mutationFn: async (bureau: string) => {
      return apiRequest("POST", "/api/credit-protection", { certificateId, bureau });
    },
    onSuccess: async () => {
      await refetchCreditProtection();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setShowCreditProtection(false);
      toast({
        title: "Credit Protection Initiated",
        description: "Your request has been created and is pending approval.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create credit protection request",
        variant: "destructive",
      });
    },
  });

  const updateCreditProtectionMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/credit-protection/${id}`, { status });
    },
    onSuccess: async () => {
      await refetchCreditProtection();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Status Updated",
        description: "Credit protection request status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update credit protection request",
        variant: "destructive",
      });
    },
  });

  const handleUpdateCreditStatus = (id: string, status: string) => {
    updateCreditProtectionMutation.mutate({ id, status });
  };

  // Mail Service Requests (USPS Mail Stop, Marketing DNC)
  const { data: mailServiceRequests, isLoading: mailLoading, refetch: refetchMailServices } = useQuery<MailServiceRequest[]>({
    queryKey: ["/api/mail-services"],
  });

  const createMailServiceMutation = useMutation({
    mutationFn: async (serviceType: string) => {
      return apiRequest("POST", "/api/mail-services", { certificateId, serviceType });
    },
    onSuccess: async () => {
      await refetchMailServices();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setShowMailService(false);
      toast({
        title: "Mail Service Request Created",
        description: "Your request has been created and is ready to process.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create mail service request",
        variant: "destructive",
      });
    },
  });

  const updateMailServiceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/mail-services/${id}`, { status });
    },
    onSuccess: async () => {
      await refetchMailServices();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Status Updated",
        description: "Mail service request status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update mail service request",
        variant: "destructive",
      });
    },
  });

  const handleUpdateMailServiceStatus = (id: string, status: string) => {
    updateMailServiceMutation.mutate({ id, status });
  };

  const notifyAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/government-notifications/notify-all/${certificateId}`);
    },
    onSuccess: async () => {
      await refetchGovNotifications();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Notifications Sent",
        description: "Death notifications have been sent to SSA, VA, and Medicare to stop benefit payments and identify survivor benefits.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send government notifications",
        variant: "destructive",
      });
    },
  });

  const addBeneficiaryMutation = useMutation({
    mutationFn: async (data: typeof newBeneficiary) => {
      return apiRequest("POST", "/api/beneficiaries", {
        ...data,
        certificateId,
      });
    },
    onSuccess: async () => {
      await refetchBeneficiaries();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setShowAddBeneficiary(false);
      setNewBeneficiary({ fullName: "", relationship: "spouse", email: "", phone: "", isMinor: false });
      toast({
        title: "Beneficiary Added",
        description: "The beneficiary has been registered for benefits eligibility review.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add beneficiary",
        variant: "destructive",
      });
    },
  });

  const scheduleAppointmentMutation = useMutation({
    mutationFn: async (data: typeof newAppointment) => {
      return apiRequest("POST", "/api/appointments", {
        ...data,
        certificateId,
      });
    },
    onSuccess: async () => {
      await refetchAppointments();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setShowScheduleAppointment(false);
      setNewAppointment({ agency: "ssa", appointmentType: "Benefits Consultation", scheduledDate: "", scheduledTime: "", isVirtual: false, location: "" });
      toast({
        title: "Appointment Scheduled",
        description: "Your benefits consultation appointment has been scheduled.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to schedule appointment",
        variant: "destructive",
      });
    },
  });

  const isLoading = certificatesLoading || beneficiariesLoading || appointmentsLoading || govLoading;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="heading-benefits">Benefits and government</h1>
            <p className="text-muted-foreground mt-1">
              Tell agencies about a death, review possible survivor benefits, and keep related requests together.
            </p>
          </div>
       <Card className="border-primary/20 bg-secondary/25">
         <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
           <div className="flex items-start gap-3">
             <HandHeart className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
             <div><p className="font-serif text-lg font-semibold">Practical support, carefully chosen</p><p className="text-sm text-muted-foreground">Find vetted providers for the work ahead. You contact them directly; your case stays private.</p></div>
           </div>
           <Button asChild variant="outline"><a href="/marketplace">Browse vetted providers</a></Button>
         </CardContent>
       </Card>
          <Button 
            onClick={() => notifyAllMutation.mutate()}
            disabled={!certificateId || notifyAllMutation.isPending}
            data-testid="button-notify-all"
          >
            <Send className="h-4 w-4 mr-2" />
            {notifyAllMutation.isPending ? "Sending..." : "Notify key agencies"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-gov-notifications">
                    {govNotifications?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Agency updates</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-beneficiaries">
                    {beneficiaries?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Beneficiaries</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-appointments">
                    {appointments?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Appointments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-800 dark:text-amber-400">Your information is protected</h3>
                <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                  We encrypt your information when we store and send it. We hide Social Security numbers and other sensitive details unless an authorized agency needs them to verify a request.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="notifications" className="space-y-4">
          <TabsList>
            <TabsTrigger value="notifications" data-testid="tab-notifications">
              <Building2 className="h-4 w-4 mr-2" />
               Tell government agencies
            </TabsTrigger>
            <TabsTrigger value="beneficiaries" data-testid="tab-beneficiaries">
              <Users className="h-4 w-4 mr-2" />
              Beneficiaries
            </TabsTrigger>
            <TabsTrigger value="appointments" data-testid="tab-appointments">
              <Calendar className="h-4 w-4 mr-2" />
              Appointments
            </TabsTrigger>
            <TabsTrigger value="credit-protection" data-testid="tab-credit-protection">
              <CreditCard className="h-4 w-4 mr-2" />
               Protect credit
            </TabsTrigger>
            <TabsTrigger value="mail-services" data-testid="tab-mail-services">
              <MailX className="h-4 w-4 mr-2" />
               Mail and marketing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : govNotifications && govNotifications.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {govNotifications.map((notification) => (
                  <GovernmentNotificationCard key={notification.id} notification={notification} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No agency notices sent yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Tell Social Security, Veterans Affairs, and Medicare about the death when you are ready.
                  </p>
                  <Button onClick={() => notifyAllMutation.mutate()} disabled={!certificateId}>
                    <Send className="h-4 w-4 mr-2" />
                     Notify key agencies
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="beneficiaries" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowAddBeneficiary(true)} data-testid="button-add-beneficiary">
                <Plus className="h-4 w-4 mr-2" />
                 Add a person
              </Button>
            </div>
            
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : beneficiaries && beneficiaries.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {beneficiaries.map((beneficiary) => (
                  <BeneficiaryCard key={beneficiary.id} beneficiary={beneficiary} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No people added yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add a spouse, child, or dependent who may qualify for survivor benefits.
                  </p>
                  <Button onClick={() => setShowAddBeneficiary(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                     Add a person
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="appointments" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowScheduleAppointment(true)} data-testid="button-schedule-appointment">
                <Plus className="h-4 w-4 mr-2" />
                 Schedule an appointment
              </Button>
            </div>
            
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : appointments && appointments.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {appointments.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No appointments scheduled</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Schedule time with Social Security, Veterans Affairs, or another agency when you need help.
                  </p>
                  <Button onClick={() => setShowScheduleAppointment(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                     Schedule an appointment
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="credit-protection" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowCreditProtection(true)} data-testid="button-protect-credit" disabled={!certificateId}>
                <Plus className="h-4 w-4 mr-2" />
                 Start credit protection
              </Button>
            </div>
            
            {creditLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : creditProtectionRequests && creditProtectionRequests.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {creditProtectionRequests.map((request) => (
                  <CreditProtectionCard 
                    key={request.id} 
                    request={request}
                    onUpdateStatus={handleUpdateCreditStatus}
                    certificate={certificates?.find(c => c.id === request.certificateId)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Help protect against identity theft</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Tell the credit bureaus about the death. This can help prevent new credit applications in your loved one’s name.
                  </p>
                  <Button onClick={() => setShowCreditProtection(true)} disabled={!certificateId}>
                    <CreditCard className="h-4 w-4 mr-2" />
                     Start credit protection
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="mail-services" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowMailService(true)} data-testid="button-mail-service" disabled={!certificateId}>
                <Plus className="h-4 w-4 mr-2" />
                Add Mail Service
              </Button>
            </div>
            
            {mailLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : mailServiceRequests && mailServiceRequests.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {mailServiceRequests.map((request) => (
                  <MailServiceCard 
                    key={request.id} 
                    request={request}
                    onUpdateStatus={handleUpdateMailServiceStatus}
                    certificate={certificates?.find(c => c.id === request.certificateId)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <MailX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Stop Unwanted Mail</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Stop mail delivery and remove the deceased from marketing lists to prevent unwanted correspondence
                  </p>
                  <Button onClick={() => setShowMailService(true)} disabled={!certificateId}>
                    <MailX className="h-4 w-4 mr-2" />
                    Add Mail Service
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showMailService} onOpenChange={setShowMailService}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mail & Marketing Protection</DialogTitle>
            <DialogDescription>
              Stop unwanted mail and remove the deceased from marketing lists.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-400">How This Works</p>
                  <p className="text-amber-700 dark:text-amber-500 mt-1">
                    We'll guide you through submitting requests to stop mail delivery or remove the deceased from marketing lists. 
                    You'll need to visit the official websites to complete the process.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mailService">Select Service</Label>
              <Select value={selectedMailService} onValueChange={setSelectedMailService}>
                <SelectTrigger id="mailService" data-testid="select-mail-service">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usps_mail_stop">USPS Mail Stop</SelectItem>
                  <SelectItem value="dnc_marketing">Marketing Do Not Contact (DNC)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mailServiceDescriptions[selectedMailService]}
              </p>
            </div>

            {certificates && certificates.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-2">Certificate Information</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><span className="font-medium">Deceased:</span> {selectedCertificate?.deceasedName}</p>
                  <p><span className="font-medium">Date of Death:</span> {selectedCertificate ? new Date(selectedCertificate.dateOfDeath).toLocaleDateString() : ""}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMailService(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createMailServiceMutation.mutate(selectedMailService)}
              disabled={createMailServiceMutation.isPending || !certificateId}
              data-testid="button-submit-mail-service"
            >
              {createMailServiceMutation.isPending ? "Creating..." : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreditProtection} onOpenChange={setShowCreditProtection}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Protect Credit from Fraud</DialogTitle>
            <DialogDescription>
              Report the death to a credit bureau to prevent fraudulent credit applications in the deceased's name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-400">Important Information</p>
                  <p className="text-amber-700 dark:text-amber-500 mt-1">
                    This process will guide you through reporting the death to the selected credit bureau. 
                    You will need to visit their official website and complete their verification process.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bureau">Select Credit Bureau</Label>
              <Select value={selectedBureau} onValueChange={setSelectedBureau}>
                <SelectTrigger id="bureau" data-testid="select-bureau">
                  <SelectValue placeholder="Select a credit bureau" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="experian">Experian</SelectItem>
                  <SelectItem value="equifax">Equifax</SelectItem>
                  <SelectItem value="transunion">TransUnion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {certificates && certificates.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-2">Certificate Information</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><span className="font-medium">Deceased:</span> {selectedCertificate?.deceasedName}</p>
                  <p><span className="font-medium">Date of Death:</span> {selectedCertificate ? new Date(selectedCertificate.dateOfDeath).toLocaleDateString() : ""}</p>
                  <p><span className="font-medium">Certificate #:</span> {selectedCertificate?.certificateNumber}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditProtection(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createCreditProtectionMutation.mutate(selectedBureau)}
              disabled={createCreditProtectionMutation.isPending || !certificateId}
              data-testid="button-submit-credit-protection"
            >
              {createCreditProtectionMutation.isPending ? "Creating..." : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddBeneficiary} onOpenChange={setShowAddBeneficiary}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Beneficiary</DialogTitle>
            <DialogDescription>
              Add a family member who may be eligible for survivor benefits
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={newBeneficiary.fullName}
                onChange={(e) => setNewBeneficiary({ ...newBeneficiary, fullName: e.target.value })}
                placeholder="Enter full legal name"
                data-testid="input-beneficiary-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship</Label>
              <Select
                value={newBeneficiary.relationship}
                onValueChange={(v) => setNewBeneficiary({ ...newBeneficiary, relationship: v as typeof newBeneficiary.relationship })}
              >
                <SelectTrigger data-testid="select-relationship">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="dependent">Dependent</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newBeneficiary.email}
                  onChange={(e) => setNewBeneficiary({ ...newBeneficiary, email: e.target.value })}
                  placeholder="Email address"
                  data-testid="input-beneficiary-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={newBeneficiary.phone}
                  onChange={(e) => setNewBeneficiary({ ...newBeneficiary, phone: e.target.value })}
                  placeholder="Phone number"
                  data-testid="input-beneficiary-phone"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBeneficiary(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => addBeneficiaryMutation.mutate(newBeneficiary)}
              disabled={!newBeneficiary.fullName || addBeneficiaryMutation.isPending}
              data-testid="button-save-beneficiary"
            >
              {addBeneficiaryMutation.isPending ? "Adding..." : "Add Beneficiary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleAppointment} onOpenChange={setShowScheduleAppointment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Appointment</DialogTitle>
            <DialogDescription>
              Schedule a benefits consultation with a government agency
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agency">Agency</Label>
              <Select
                value={newAppointment.agency}
                onValueChange={(v) => setNewAppointment({ ...newAppointment, agency: v as typeof newAppointment.agency })}
              >
                <SelectTrigger data-testid="select-agency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssa">Social Security Administration</SelectItem>
                  <SelectItem value="va">Veterans Affairs</SelectItem>
                  <SelectItem value="medicare">Medicare</SelectItem>
                  <SelectItem value="medicaid">Medicaid</SelectItem>
                  <SelectItem value="state_benefits">State Benefits Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointmentType">Appointment Type</Label>
              <Select
                value={newAppointment.appointmentType}
                onValueChange={(v) => setNewAppointment({ ...newAppointment, appointmentType: v })}
              >
                <SelectTrigger data-testid="select-appointment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Benefits Consultation">Benefits Consultation</SelectItem>
                  <SelectItem value="Survivor Benefits Application">Survivor Benefits Application</SelectItem>
                  <SelectItem value="Death Notification Verification">Death Notification Verification</SelectItem>
                  <SelectItem value="Document Submission">Document Submission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={newAppointment.scheduledDate}
                  onChange={(e) => setNewAppointment({ ...newAppointment, scheduledDate: e.target.value })}
                  data-testid="input-appointment-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={newAppointment.scheduledTime}
                  onChange={(e) => setNewAppointment({ ...newAppointment, scheduledTime: e.target.value })}
                  data-testid="input-appointment-time"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location (if in-person)</Label>
              <Input
                id="location"
                value={newAppointment.location}
                onChange={(e) => setNewAppointment({ ...newAppointment, location: e.target.value })}
                placeholder="Office address or leave blank for virtual"
                data-testid="input-appointment-location"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleAppointment(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => scheduleAppointmentMutation.mutate(newAppointment)}
              disabled={!newAppointment.scheduledDate || !newAppointment.scheduledTime || scheduleAppointmentMutation.isPending}
              data-testid="button-save-appointment"
            >
              {scheduleAppointmentMutation.isPending ? "Scheduling..." : "Schedule Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
