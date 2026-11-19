import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  createLegacyMessage, deleteLegacyMessage, LegacyMessage, LEGACY_MESSAGES_KEY,
  legacyMessageStreamUrl, prepareLegacyMessageMedia, updateLegacyMessage,
  updateLegacyMessageTranscript, uploadAndFinalizeLegacyMessageMedia,
} from "@/lib/legacy-messages-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  Check, FileAudio, FileVideo, Loader2, Lock, MessageSquareText, Mic, Pencil,
  Plus, RefreshCw, Square, Trash2, Upload, Video,
} from "lucide-react";
import { SectionNavigation, useHeartPlanAdvance, useSectionPageFocus } from "./section-navigation";

interface PlanContact { id: string; fullName: string; email: string | null }
type MediaKind = "audio" | "video";
type ComposerKind = "text" | MediaKind;
interface ComposerForm {
  recipientName: string; recipientContactId: string; subject: string; body: string;
}

const EMPTY_FORM: ComposerForm = { recipientName: "", recipientContactId: "", subject: "", body: "" };
const LIMITS = {
  audio: { bytes: 25 * 1024 * 1024, seconds: 5 * 60, label: "25MB and 5 minutes" },
  video: { bytes: 100 * 1024 * 1024, seconds: 5 * 60, label: "100MB and 5 minutes" },
};
const ALLOWED = {
  audio: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
};

function formatBytes(bytes?: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function formatDuration(seconds?: number | null) {
  if (seconds == null) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function readDuration(file: File, kind: MediaKind) {
  return new Promise<number>((resolve, reject) => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(file);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = element.duration;
      URL.revokeObjectURL(url);
      Number.isFinite(duration) ? resolve(duration) : reject(new Error("Could not read the media duration."));
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This media file could not be read."));
    };
    element.src = url;
  });
}

function mediaKind(message: LegacyMessage): MediaKind | null {
  if (message.contentType?.startsWith("audio/")) return "audio";
  if (message.contentType?.startsWith("video/")) return "video";
  if (message.messageType === "audio" || message.messageType === "video") return message.messageType;
  return null;
}

export default function HeartPlanLetters() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [kind, setKind] = useState<ComposerKind>("text");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [replacementConsent, setReplacementConsent] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacingIdRef = useRef<string | null>(null);
  const { headingRef, firstControlRef } = useSectionPageFocus<HTMLButtonElement>();
  const advance = useHeartPlanAdvance("letters");

  const { data: plan } = useQuery<{ plan: { status: string } }>({ queryKey: ["/api/heartplan"] });
  const { data: messages, isLoading } = useQuery<LegacyMessage[]>({
    queryKey: LEGACY_MESSAGES_KEY,
    refetchInterval: (query) => {
      const items = query.state.data;
      return Array.isArray(items) && items.some((item) =>
        item.uploadStatus === "uploading" || item.transcriptStatus === "pending"
      ) ? 4000 : false;
    },
  });
  const { data: contacts } = useQuery<PlanContact[]>({ queryKey: ["/api/heartplan/contacts"] });
  const isActivated = plan?.plan?.status === "activated";
  const eligibleContacts = contacts?.filter((contact) => Boolean(contact.email?.trim())) ?? [];

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [previewUrl]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedRef.current) / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= LIMITS[kind === "video" ? "video" : "audio"].seconds) recorderRef.current?.stop();
    }, 500);
    return () => window.clearInterval(timer);
  }, [isRecording, kind]);

  const resetComposer = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setForm(EMPTY_FORM);
    setKind("text");
    setMediaFile(null);
    setMediaDuration(0);
    setPreviewUrl(null);
    setRecordingConsent(false);
    setReplacementConsent(false);
    setRecordingSeconds(0);
    setUploadProgress(0);
  };

  const setSelectedMedia = async (file: File, selectedKind: MediaKind) => {
    if (!ALLOWED[selectedKind].includes(file.type)) {
      throw new Error(selectedKind === "audio"
        ? "Choose an MP3, MP4/M4A, WAV, WebM, or OGG audio file."
        : "Choose an MP4, MOV, or WebM video file.");
    }
    if (file.size > LIMITS[selectedKind].bytes) throw new Error(`File exceeds the ${LIMITS[selectedKind].label} limit.`);
    const duration = await readDuration(file, selectedKind);
    if (duration > LIMITS[selectedKind].seconds + 1) throw new Error(`Recording exceeds the ${LIMITS[selectedKind].label} limit.`);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setKind(selectedKind);
    setMediaFile(file);
    setMediaDuration(duration);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUploadSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!recordingConsent) {
      toast({ title: "Consent required", description: "Confirm recording consent before adding private media.", variant: "destructive" });
      return;
    }
    try {
      await setSelectedMedia(file, kind === "video" ? "video" : "audio");
    } catch (error: any) {
      toast({ title: "Media not accepted", description: error.message, variant: "destructive" });
    }
  };

  const startRecording = async () => {
    if (!recordingConsent) {
      toast({ title: "Consent required", description: "Confirm that everyone being recorded has consented.", variant: "destructive" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Recording unavailable", description: "This browser cannot record media. You can upload a file instead.", variant: "destructive" });
      return;
    }
    try {
      const selectedKind: MediaKind = kind === "video" ? "video" : "audio";
      const stream = await navigator.mediaDevices.getUserMedia(selectedKind === "video" ? { audio: true, video: true } : { audio: true });
      streamRef.current = stream;
      if (cameraRef.current && selectedKind === "video") cameraRef.current.srcObject = stream;
      const preferred = selectedKind === "video" ? "video/webm" : "audio/webm";
      const options = MediaRecorder.isTypeSupported(preferred) ? { mimeType: preferred } : undefined;
      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const duration = Math.max(1, (Date.now() - recordingStartedRef.current) / 1000);
        const mime = recorder.mimeType || preferred;
        const blob = new Blob(chunksRef.current, { type: mime });
        const extension = mime.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `legacy-message-${Date.now()}.${extension}`, { type: mime });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsRecording(false);
        try {
          if (file.size > LIMITS[selectedKind].bytes) throw new Error(`Recording exceeds the ${LIMITS[selectedKind].label} limit.`);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setMediaFile(file);
          setMediaDuration(duration);
          setPreviewUrl(URL.createObjectURL(file));
        } catch (error: any) {
          toast({ title: "Recording not accepted", description: error.message, variant: "destructive" });
        }
      };
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.start(1000);
      setIsRecording(true);
    } catch (error: any) {
      toast({ title: "Could not start recording", description: error.message || "Check your camera and microphone permissions.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const saveMessage = async () => {
    if (!form.recipientContactId || !eligibleContacts.some((contact) => contact.id === form.recipientContactId)) {
      toast({ title: "Choose a trusted contact with an email address", variant: "destructive" });
      return;
    }
    if (!form.body.trim() && !mediaFile) {
      toast({ title: "Add text, audio, or video to your message", variant: "destructive" });
      return;
    }
    if (mediaFile && !recordingConsent) {
      toast({ title: "Consent required", description: "Confirm recording consent before sealing a media message.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      if (mediaFile) {
        const prepared = await prepareLegacyMessageMedia({
          recipientName: form.recipientName.trim(),
          recipientContactId: form.recipientContactId || undefined,
          subject: form.subject.trim() || undefined,
          messageType: kind as MediaKind,
          fileName: mediaFile.name,
          contentType: mediaFile.type,
          fileSize: mediaFile.size,
          durationSeconds: Math.max(1, Math.round(mediaDuration)),
          recordingConsent: true,
        });
        await uploadAndFinalizeLegacyMessageMedia(prepared, mediaFile, mediaDuration, setUploadProgress);
        if (form.body.trim()) await updateLegacyMessage(prepared.id, { body: form.body.trim() });
      } else {
        await createLegacyMessage({
          recipientName: form.recipientName.trim(),
          recipientContactId: form.recipientContactId || undefined,
          subject: form.subject.trim() || undefined,
          body: form.body.trim(),
          messageType: "text",
        });
      }
      await queryClient.invalidateQueries({ queryKey: LEGACY_MESSAGES_KEY });
      await queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      trackAnalyticsEvent("heartplan_content_saved", { section: "legacy_messages" });
      setDialogOpen(false);
      resetComposer();
      toast({ title: "Legacy Message sealed", description: "It stays private until your plan is activated." });
      await advance.advanceAfterSave();
    } catch (error: any) {
      toast({ title: "Could not save message", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: deleteLegacyMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEGACY_MESSAGES_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Legacy Message deleted" });
    },
    onError: (error: any) => toast({ title: "Could not delete message", description: error.message, variant: "destructive" }),
  });

  const transcriptMutation = useMutation({
    mutationFn: ({ id, transcript }: { id: string; transcript: string }) => updateLegacyMessageTranscript(id, transcript),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEGACY_MESSAGES_KEY });
      setEditingTranscript(null);
      toast({ title: "Transcript saved" });
    },
    onError: (error: any) => toast({ title: "Could not save transcript", description: error.message, variant: "destructive" }),
  });

  const replaceMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const id = replacingIdRef.current;
    event.target.value = "";
    if (!file || !id) return;
    if (!replacementConsent) {
      toast({ title: "Consent required", description: "Confirm recording consent before replacing private media.", variant: "destructive" });
      return;
    }
    const selectedKind: MediaKind = file.type.startsWith("video/") ? "video" : "audio";
    try {
      if (!ALLOWED[selectedKind].includes(file.type)) throw new Error("Choose a supported audio or video file.");
      if (file.size > LIMITS[selectedKind].bytes) throw new Error(`File exceeds the ${LIMITS[selectedKind].label} limit.`);
      const duration = await readDuration(file, selectedKind);
      if (duration > LIMITS[selectedKind].seconds + 1) throw new Error(`File exceeds the ${LIMITS[selectedKind].label} limit.`);
      const existing = messages?.find((message) => message.id === id);
      if (!existing) throw new Error("Message no longer exists.");
      const prepared = await prepareLegacyMessageMedia({
        recipientName: existing.recipientName,
        recipientContactId: existing.recipientContactId || undefined,
        subject: existing.subject || undefined,
        messageType: selectedKind,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        durationSeconds: Math.max(1, Math.round(duration)),
        recordingConsent: true,
      }, id);
      setUploadProgress(1);
      await uploadAndFinalizeLegacyMessageMedia(prepared, file, duration, setUploadProgress);
      await queryClient.invalidateQueries({ queryKey: LEGACY_MESSAGES_KEY });
      toast({ title: "Media replaced", description: "The new file is being processed." });
    } catch (error: any) {
      toast({ title: "Could not replace media", description: error.message, variant: "destructive" });
    } finally {
      setUploadProgress(0);
      replacingIdRef.current = null;
    }
  };

  const pickContact = (contactId: string) => {
    const contact = contacts?.find((item) => item.id === contactId);
    setForm((current) => ({ ...current, recipientContactId: contactId, recipientName: contact?.fullName || current.recipientName }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-6 w-6 text-primary" />
            <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold scroll-mt-6 outline-none" data-testid="text-legacy-messages-title">Legacy Messages</h1>
          </div>
          <p className="mt-1 text-muted-foreground">Leave a private note, recording, or video for someone you trust. It stays sealed until your plan is activated.</p>
        </div>
        {!isActivated && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open && !isSaving) resetComposer(); }}>
            <DialogTrigger asChild>
              <Button ref={firstControlRef} data-testid="button-add-legacy-message"><Plus className="h-4 w-4 mr-2" /> Add message</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create a Legacy Message</DialogTitle>
                <DialogDescription>Choose one trusted contact. Only that person can receive this message after your plan is activated.</DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-2" aria-label="Message format">
                  {(["text", "audio", "video"] as ComposerKind[]).map((option) => (
                    <Button key={option} type="button" variant={kind === option ? "default" : "outline"}
                      onClick={() => { setKind(option); setMediaFile(null); setPreviewUrl(null); }}
                      data-testid={`button-message-type-${option}`} className="capitalize">
                      {option === "text" ? <MessageSquareText className="h-4 w-4 mr-2" /> : option === "audio" ? <FileAudio className="h-4 w-4 mr-2" /> : <FileVideo className="h-4 w-4 mr-2" />}
                      {option}
                    </Button>
                  ))}
                </div>
                {eligibleContacts.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Who should receive this? *</Label>
                    <Select value={form.recipientContactId} onValueChange={pickContact}>
                      <SelectTrigger data-testid="select-message-contact"><SelectValue placeholder="Choose a contact with an email…" /></SelectTrigger>
                      <SelectContent>{eligibleContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>{contact.fullName} ({contact.email})</SelectItem>
                      ))}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Card className="border-primary/30 bg-primary/5" data-testid="message-contact-guidance">
                    <CardContent className="pt-6 text-sm">
                      First add a trusted contact with an email address. We deliver the message securely to that person after activation.
                    </CardContent>
                  </Card>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="messageSubject">Subject</Label>
                  <Input id="messageSubject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} data-testid="input-message-subject" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="messageBody">{kind === "text" ? "Your message *" : "Written message (optional)"}</Label>
                  <Textarea id="messageBody" rows={kind === "text" ? 7 : 4} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} data-testid="input-message-body" />
                  {kind !== "text" && <p className="text-xs text-muted-foreground">Add text to create a combined written and {kind} message.</p>}
                </div>
                {kind !== "text" && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Add {kind}</CardTitle>
                          <CardDescription>Record or upload one file. The limit is {LIMITS[kind].label}. Recording stops at the limit.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {kind === "video" && isRecording && <video ref={cameraRef} autoPlay muted playsInline className="w-full max-h-56 rounded-md bg-black" aria-label="Camera preview" />}
                      {!mediaFile && (
                        <>
                          <div className="flex items-start gap-2">
                            <Checkbox id="recordingConsent" checked={recordingConsent} onCheckedChange={(value) => setRecordingConsent(value === true)} data-testid="checkbox-recording-consent" />
                            <Label htmlFor="recordingConsent" className="font-normal leading-snug">I confirm that everyone in this recording knows about it and agreed to be recorded.</Label>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant={isRecording ? "destructive" : "outline"} onClick={isRecording ? stopRecording : startRecording} data-testid="button-record-media">
                              {isRecording ? <Square className="h-4 w-4 mr-2" /> : kind === "video" ? <Video className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
                              {isRecording ? `Stop (${formatDuration(recordingSeconds)})` : `Record ${kind}`}
                            </Button>
                            <input ref={uploadInputRef} type="file" className="hidden" accept={kind === "audio" ? "audio/*" : "video/mp4,video/quicktime,video/webm"} onChange={handleUploadSelection} />
                            <Button type="button" variant="outline" onClick={() => uploadInputRef.current?.click()} disabled={isRecording || !recordingConsent} data-testid="button-upload-media">
                              <Upload className="h-4 w-4 mr-2" /> Upload file
                            </Button>
                          </div>
                        </>
                      )}
                      {mediaFile && previewUrl && (
                        <div className="space-y-2">
                          {kind === "audio"
                            ? <audio controls src={previewUrl} className="w-full" data-testid="preview-new-audio" />
                            : <video controls src={previewUrl} className="w-full max-h-72 rounded-md bg-black" data-testid="preview-new-video" />}
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{mediaFile.name} · {formatBytes(mediaFile.size)} · {formatDuration(mediaDuration)}</span>
                            <Button type="button" variant="ghost" size="sm" onClick={() => { setMediaFile(null); setPreviewUrl(null); }} data-testid="button-remove-new-media">Remove</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
                {isSaving && mediaFile && <div className="space-y-1" aria-live="polite"><Progress value={uploadProgress} /><p className="text-xs text-muted-foreground">Uploading… {uploadProgress}%</p></div>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
                <Button type="button" onClick={saveMessage} disabled={isSaving || isRecording || eligibleContacts.length === 0 || !form.recipientContactId || (kind !== "text" && !recordingConsent)} data-testid="button-save-legacy-message">
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save private message
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isActivated && <Card className="border-primary/40"><CardContent className="pt-6 text-sm"><Lock className="h-4 w-4 inline mr-2" />This plan is active. These messages are read-only and cannot be changed.</CardContent></Card>}

      <Card>
        <CardHeader><CardTitle className="text-lg">Your Legacy Messages</CardTitle><CardDescription>Messages, recordings, and written captions stay private while sealed.</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            : !messages?.length ? <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-legacy-messages">No messages yet. Add one when you are ready.</p>
            : <div className="space-y-4">{messages.map((message) => {
              const media = mediaKind(message);
              const status = message.uploadStatus;
              const processing = status === "uploading";
              return (
                <div key={message.id} className="rounded-md border p-4 space-y-3" data-testid={`legacy-message-${message.id}`}>
                  <div className="flex items-start gap-3">
                    {media === "video" ? <FileVideo className="h-5 w-5 text-muted-foreground mt-0.5" /> : media === "audio" ? <FileAudio className="h-5 w-5 text-muted-foreground mt-0.5" /> : <MessageSquareText className="h-5 w-5 text-muted-foreground mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 flex-wrap items-center">
                        <p className="font-medium text-sm">To: {message.recipientName}</p>
                        <Badge variant={message.releasedAt ? "default" : "secondary"}>{message.releasedAt ? "Delivered" : "Sealed"}</Badge>
                        {media && <Badge variant="outline" className="capitalize">{message.body ? `Text + ${media}` : media}</Badge>}
                      </div>
                      {message.subject && <p className="text-xs text-muted-foreground">{message.subject}</p>}
                    </div>
                    {!isActivated && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" data-testid={`button-delete-message-${message.id}`} aria-label={`Delete message to ${message.recipientName}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this Legacy Message?</AlertDialogTitle><AlertDialogDescription>This permanently deletes its text, media, and transcript. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteMutation.mutate(message.id)}>Delete permanently</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  {message.body && <p className="text-sm whitespace-pre-wrap">{message.body}</p>}
                  {media && (
                    <div className="space-y-2">
                      {processing ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Processing {media}…</div>
                        : status === "failed" ? <p className="text-sm text-destructive">Media processing failed. Replace the file to try again.</p>
                        : media === "audio" ? <audio controls preload="metadata" src={legacyMessageStreamUrl(message.id, message.objectPath)} className="w-full" data-testid={`audio-message-${message.id}`} />
                        : <video controls preload="metadata" src={legacyMessageStreamUrl(message.id, message.objectPath)} className="w-full max-h-80 rounded-md bg-black" data-testid={`video-message-${message.id}`} />}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-muted-foreground">{[message.fileName, formatBytes(message.fileSize), formatDuration(message.durationSeconds)].filter(Boolean).join(" · ")}</p>
                        {!isActivated && <div className="flex items-center gap-2">
                          <Checkbox id={`replacement-consent-${message.id}`} checked={replacementConsent} onCheckedChange={(value) => setReplacementConsent(value === true)} data-testid={`checkbox-replacement-consent-${message.id}`} />
                          <Label htmlFor={`replacement-consent-${message.id}`} className="text-xs font-normal">I have recording consent</Label>
                          <Button type="button" variant="outline" size="sm" disabled={uploadProgress > 0 || !replacementConsent} onClick={() => { replacingIdRef.current = message.id; replaceInputRef.current?.click(); }} data-testid={`button-replace-media-${message.id}`}><RefreshCw className="h-3.5 w-3.5 mr-1" />Replace media</Button>
                        </div>}
                      </div>
                    </div>
                  )}
                  {media && (
                    <div className="rounded-md bg-muted/40 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Transcript</p>
                        {message.transcriptStatus === "pending"
                          ? <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>
                          : message.transcriptStatus === "failed" ? <Badge variant="destructive">Failed</Badge>
                          : message.transcript ? <Badge variant="outline"><Check className="h-3 w-3 mr-1" />Ready</Badge> : null}
                      </div>
                      {editingTranscript === message.id ? (
                        <>
                          <Label htmlFor={`transcript-${message.id}`} className="sr-only">Edit transcript</Label>
                          <Textarea id={`transcript-${message.id}`} value={transcriptDraft} onChange={(event) => setTranscriptDraft(event.target.value)} rows={5} data-testid={`input-transcript-${message.id}`} />
                          <div className="flex gap-2 justify-end"><Button size="sm" variant="ghost" onClick={() => setEditingTranscript(null)}>Cancel</Button><Button size="sm" onClick={() => transcriptMutation.mutate({ id: message.id, transcript: transcriptDraft })} disabled={transcriptMutation.isPending}>Save transcript</Button></div>
                        </>
                      ) : message.transcript ? (
                        <div className="flex items-start gap-2"><p className="text-sm whitespace-pre-wrap flex-1">{message.transcript}</p>{!isActivated && <Button variant="ghost" size="sm" onClick={() => { setEditingTranscript(message.id); setTranscriptDraft(message.transcript || ""); }} data-testid={`button-edit-transcript-${message.id}`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>}</div>
                      ) : <p className="text-xs text-muted-foreground">{message.transcriptStatus === "failed" ? "Transcription failed. Replacing the media will try again." : "No transcript available."}</p>}
                    </div>
                  )}
                </div>
              );
            })}</div>}
        </CardContent>
      </Card>
      <input ref={replaceInputRef} type="file" className="hidden" accept="audio/*,video/mp4,video/quicktime,video/webm" onChange={replaceMedia} />
      {uploadProgress > 0 && !dialogOpen && <div className="space-y-1" aria-live="polite"><Progress value={uploadProgress} /><p className="text-xs text-muted-foreground">Replacing media… {uploadProgress}%</p></div>}
      {!isActivated && <SectionNavigation section="letters" onSave={messages?.length ? advance.advanceAfterSave : undefined} saveLabel="Save and finish" onDefer={advance.deferSection} saved={advance.saved} isAdvancing={advance.isAdvancing} />}
    </div>
  );
}