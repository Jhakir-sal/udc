import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, Plus, Trash2, Star, MailCheck, MailWarning, Pencil, RotateCw } from "lucide-react";
import { SectionNavigation, useHeartPlanAdvance, useSectionPageFocus } from "./section-navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";

interface PlanContact {
  id: string;
  fullName: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isPrimary: boolean;
  canRequestActivation: boolean;
  notifyOnActivation: boolean;
  infoEmailSentAt: string | null;
  infoEmailFailedAt: string | null;
  isAdvisor: boolean;
  advisorAccessLevel: "full" | "limited";
  advisorPermission: "view" | "edit";
  advisorNotifiedAt: string | null;
}

const EMPTY_FORM = {
  fullName: "", relationship: "", phone: "", email: "", address: "",
  isPrimary: false, canRequestActivation: false, notifyOnActivation: true,
  isAdvisor: false, advisorAccessLevel: "limited" as "full" | "limited", advisorPermission: "view" as "view" | "edit",
};

export default function HeartPlanContacts() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingContact, setEditingContact] = useState<PlanContact | null>(null);
  const { headingRef, firstControlRef } = useSectionPageFocus<HTMLButtonElement>();
  const advance = useHeartPlanAdvance("contacts");

  const openAddDialog = () => {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (contact: PlanContact) => {
    setEditingContact(contact);
    setForm({
      fullName: contact.fullName,
      relationship: contact.relationship ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      address: contact.address ?? "",
      isPrimary: contact.isPrimary,
      canRequestActivation: contact.canRequestActivation,
      notifyOnActivation: contact.notifyOnActivation,
      isAdvisor: contact.isAdvisor,
      advisorAccessLevel: contact.advisorAccessLevel,
      advisorPermission: contact.advisorPermission,
    });
    setDialogOpen(true);
  };

  const { data: plan } = useQuery<{ plan: { status: string } }>({ queryKey: ["/api/heartplan"] });
  const { data: contacts, isLoading } = useQuery<PlanContact[]>({ queryKey: ["/api/heartplan/contacts"] });
  const isActivated = plan?.plan?.status === "activated";

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        fullName: form.fullName.trim(),
        isPrimary: form.isPrimary,
        canRequestActivation: form.canRequestActivation,
        notifyOnActivation: form.notifyOnActivation,
        isAdvisor: form.isAdvisor,
        advisorAccessLevel: form.advisorAccessLevel,
        advisorPermission: form.advisorPermission,
      };
      for (const key of ["relationship", "phone", "email", "address"] as const) {
        if (form[key].trim()) body[key] = form[key].trim();
      }
      const res = await apiRequest("POST", "/api/heartplan/contacts", body);
      return res.json();
    },
    onSuccess: async () => {
      trackAnalyticsEvent("heartplan_content_saved", { section: "contacts" });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: "Contact added" });
      await advance.advanceAfterSave();
    },
    onError: (error: any) => {
      toast({ title: "Could not add contact", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const body: Record<string, unknown> = {
        fullName: form.fullName.trim(),
        isPrimary: form.isPrimary,
        canRequestActivation: form.canRequestActivation,
        notifyOnActivation: form.notifyOnActivation,
        isAdvisor: form.isAdvisor,
        advisorAccessLevel: form.advisorAccessLevel,
        advisorPermission: form.advisorPermission,
      };
      for (const key of ["relationship", "phone", "email", "address"] as const) {
        body[key] = form[key].trim() || null;
      }
      const res = await apiRequest("PATCH", `/api/heartplan/contacts/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      trackAnalyticsEvent("heartplan_content_saved", { section: "contacts" });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      setDialogOpen(false);
      setEditingContact(null);
      setForm(EMPTY_FORM);
      toast({ title: "Contact updated" });
    },
    onError: (error: any) => {
      toast({ title: "Could not update contact", description: error.message, variant: "destructive" });
    },
  });

  // For when the address was actually correct and the failure was transient —
  // resets the undeliverable marker server-side and re-attempts the send.
  const retryInfoEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/heartplan/contacts/${id}/retry-info-email`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/contacts"] });
      toast({
        title: "Re-sending the email",
        description: "We're trying this address again. The warning will come back if delivery keeps failing.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not retry", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/heartplan/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Contact removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove contact", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold scroll-mt-6 outline-none" data-testid="text-contacts-title">Trusted contacts</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Choose who our concierge team should contact, and optionally grant a trusted advisor secure access while you build your plan.
          </p>
        </div>
        {!isActivated && (
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setEditingContact(null);
                setForm(EMPTY_FORM);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button ref={firstControlRef} onClick={openAddDialog} data-testid="button-add-contact">
                <Plus className="h-4 w-4 mr-2" /> Add contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingContact ? "Edit trusted contact" : "Add a trusted contact"}</DialogTitle>
                <DialogDescription>Contacts may receive activation notices. Trusted advisors are notified immediately and access is tied to their email address.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="contactName">Full name *</Label>
                    <Input id="contactName" value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })} data-testid="input-contact-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="relationship">Relationship</Label>
                    <Input id="relationship" placeholder="e.g. Daughter" value={form.relationship}
                      onChange={(e) => setForm({ ...form, relationship: e.target.value })} data-testid="input-contact-relationship" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="contactPhone">Phone</Label>
                    <Input id="contactPhone" value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-contact-phone" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contactEmail">Email</Label>
                    <Input id="contactEmail" type="email" value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-contact-email" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactAddress">Address</Label>
                  <Input id="contactAddress" value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-contact-address" />
                </div>
                <div className="space-y-3 pt-1">
                   <div className="rounded-lg border p-4 space-y-4">
                     <div className="flex items-center justify-between gap-4">
                       <div>
                         <p className="text-sm font-medium">Trusted advisor</p>
                         <p className="text-xs text-muted-foreground">Notify them now and grant secure Heart Plan access.</p>
                       </div>
                       <Switch checked={form.isAdvisor} onCheckedChange={(v) => setForm({ ...form, isAdvisor: v })} data-testid="switch-contact-advisor" />
                     </div>
                     {form.isAdvisor && <div className="grid gap-3 sm:grid-cols-2">
                       <div className="space-y-1.5">
                         <Label htmlFor="advisorAccessLevel">Access level</Label>
                         <select id="advisorAccessLevel" value={form.advisorAccessLevel}
                           onChange={(event) => setForm({ ...form, advisorAccessLevel: event.target.value as "full" | "limited" })}
                           className="h-10 w-full rounded-md border bg-background px-3 text-sm" data-testid="select-advisor-access">
                           <option value="limited">Limited — fixed summary only</option>
                           <option value="full">Full — complete advisor view</option>
                         </select>
                       </div>
                       <div className="space-y-1.5">
                         <Label htmlFor="advisorPermission">Permission</Label>
                         <select id="advisorPermission" value={form.advisorPermission}
                           onChange={(event) => setForm({ ...form, advisorPermission: event.target.value as "view" | "edit" })}
                           className="h-10 w-full rounded-md border bg-background px-3 text-sm" data-testid="select-advisor-permission">
                           <option value="view">View only</option>
                           <option value="edit">Can edit within access</option>
                         </select>
                       </div>
                       <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                         Limited advisors see only a fixed summary. Full advisors see the broader plan. Edit permission applies only inside the chosen access level.
                       </p>
                     </div>}
                   </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Primary contact</p>
                      <p className="text-xs text-muted-foreground">The first person our team reaches out to.</p>
                    </div>
                    <Switch checked={form.isPrimary} onCheckedChange={(v) => setForm({ ...form, isPrimary: v })} data-testid="switch-contact-primary" />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Notify on activation</p>
                      <p className="text-xs text-muted-foreground">Email them when your plan is put into action.</p>
                    </div>
                    <Switch checked={form.notifyOnActivation} onCheckedChange={(v) => setForm({ ...form, notifyOnActivation: v })} data-testid="switch-contact-notify" />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">May request activation</p>
                       <p className="text-xs text-muted-foreground">They may ask our team to activate your plan. Our team reviews every request.</p>
                    </div>
                    <Switch checked={form.canRequestActivation} onCheckedChange={(v) => setForm({ ...form, canRequestActivation: v })} data-testid="switch-contact-activate" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    if (!form.fullName.trim()) {
                      toast({ title: "Name is required", variant: "destructive" });
                      return;
                    }
                    if (form.isAdvisor && !form.email.trim()) {
                      toast({ title: "An advisor needs an email address", variant: "destructive" });
                      return;
                    }
                    if (editingContact) {
                      updateMutation.mutate(editingContact.id);
                    } else {
                      createMutation.mutate();
                    }
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-contact"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingContact ? "Save changes" : "Add contact"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-contacts">
              No trusted contacts yet. Add the people who should be involved.
            </p>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 rounded-md border p-3" data-testid={`contact-row-${contact.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{contact.fullName}</p>
                      {contact.isPrimary && (
                        <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" /> Primary</Badge>
                      )}
                      {contact.canRequestActivation && <Badge variant="outline">Can request activation</Badge>}
                       {contact.isAdvisor && <Badge variant="outline">
                         Advisor · {contact.advisorAccessLevel === "full" ? "Full" : "Limited"} · {contact.advisorPermission === "edit" ? "Can edit" : "View only"}
                       </Badge>}
                       {contact.isAdvisor && contact.advisorNotifiedAt && <Badge variant="secondary" className="gap-1">
                         <MailCheck className="h-3 w-3" /> Advisor notified
                       </Badge>}
                      {contact.infoEmailFailedAt && (
                        <>
                          <Badge variant="destructive" className="gap-1" data-testid={`badge-email-failed-${contact.id}`}>
                            <MailWarning className="h-3 w-3" />
                            Email undeliverable — please check the address
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => retryInfoEmailMutation.mutate(contact.id)}
                            disabled={retryInfoEmailMutation.isPending}
                            data-testid={`button-retry-info-email-${contact.id}`}
                          >
                            {retryInfoEmailMutation.isPending
                              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              : <RotateCw className="h-3 w-3 mr-1" />}
                            Try again
                          </Button>
                        </>
                      )}
                      {contact.infoEmailSentAt && (
                        <Badge variant="secondary" className="gap-1" data-testid={`badge-notified-${contact.id}`}>
                          <MailCheck className="h-3 w-3" />
                          Notified {new Date(contact.infoEmailSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[contact.relationship, contact.phone, contact.email].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {!isActivated && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(contact)}
                        data-testid={`button-edit-contact-${contact.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${contact.fullName}`}
                        onClick={() => {
                          if (window.confirm(`Remove ${contact.fullName} as a trusted contact? They will no longer receive notices from this plan.`)) deleteMutation.mutate(contact.id);
                        }}
                        disabled={deleteMutation.isPending} data-testid={`button-delete-contact-${contact.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {!isActivated && <SectionNavigation section="contacts"
        onSave={contacts && contacts.length > 0 ? advance.advanceAfterSave : undefined}
        saveLabel="Save and continue" onDefer={advance.deferSection}
        saved={advance.saved} isAdvancing={advance.isAdvancing} />}
    </div>
  );
}
