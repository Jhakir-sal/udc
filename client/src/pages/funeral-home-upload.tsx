import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Building2, CheckCircle2, FileUp, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export default function FuneralHomeUploadPage() {
  const [, params] = useRoute("/funeral-home-upload/:token");
  const token = params?.token;
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "success">("idle");
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/funeral-home-upload", token],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch(`/api/funeral-home-upload/${token}`);
      if (!response.ok) throw new Error("This invitation is unavailable.");
      return response.json();
    },
  });

  const submit = async () => {
    if (!file || !token) return;
    if (!TYPES.includes(file.type)) return setError("Choose a PDF, JPEG, PNG, or WebP file.");
    if (file.size > MAX_SIZE) return setError("The file must be 10 MB or smaller.");
    setError(""); setStatus("uploading"); setProgress(15);
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/funeral-home-upload/${token}`);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (event) => event.lengthComputable && setProgress(Math.max(15, Math.round((event.loaded / event.total) * 100)));
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          let message = "Upload could not be completed. Please try again or contact the person who sent the invitation.";
          if (xhr.status >= 400 && xhr.status < 500) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (typeof response.error === "string") message = response.error;
            } catch { /* Non-JSON response: keep the helpful default. */ }
          }
          reject(new Error(message));
        };
        xhr.onerror = () => reject(new Error("Upload could not be completed. Check your connection and try again."));
        xhr.send(file);
      });
      setProgress(100); setStatus("success");
    } catch (e: any) {
      setStatus("idle"); setProgress(0); setError(e.message || "Upload could not be completed. Please try again.");
    }
  };

  const unavailable = isError || (data && ["expired", "revoked", "completed"].includes(String(data.status || data.invitationStatus || "").toLowerCase()));
  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Building2 /></div>
          <h1 className="mt-2 text-2xl font-semibold">Secure certificate upload</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your funeral home was invited to provide a document for a Steps After Life case.</p>
        </header>
        <Card>
          <CardHeader><CardTitle className="text-lg">Upload the requested certificate</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> :
              unavailable ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><XCircle className="mb-2 text-destructive" /><p className="font-medium">This invitation is no longer available.</p><p className="mt-1 text-muted-foreground">Please contact the person who sent the invitation for a new secure link.</p></div> :
              status === "success" ? <div className="rounded-lg border border-green-300 bg-green-50 p-5 text-center text-green-800"><CheckCircle2 className="mx-auto mb-2" /><p className="font-semibold">Document received</p><p className="mt-1 text-sm">Thank you. The Steps After Life team will review the upload securely.</p></div> :
              <>
                {data?.funeralHomeName && <div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="text-muted-foreground">Invited funeral home</p><p className="font-medium">{data.funeralHomeName}</p></div>}
                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <FileUp className="mx-auto mb-2 h-8 w-8 text-primary" />
                  <p className="font-medium">{file ? file.name : "Choose a certificate file"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, JPEG, PNG, or WebP · maximum 10 MB</p>
                  <input id="funeral-upload" type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); }} />
                  <Button variant="outline" className="mt-4" asChild><label htmlFor="funeral-upload" className="cursor-pointer">Select file</label></Button>
                </div>
                {status === "uploading" && <div className="space-y-2"><Progress value={progress} /><p className="text-center text-xs text-muted-foreground">Uploading securely… {progress}%</p></div>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" disabled={!file || status === "uploading"} onClick={submit}><Lock className="mr-2 h-4 w-4" />{status === "uploading" ? "Uploading…" : "Upload certificate"}</Button>
                <div className="space-y-2 text-xs text-muted-foreground"><p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />Your file is sent through a secure, time-limited invitation.</p><p>Review the file name before submitting. The Steps After Life team will review your document before taking further action.</p></div>
              </>}
          </CardContent>
        </Card>
        <p className="mt-5 text-center text-xs text-muted-foreground">By uploading, you confirm you are authorized to provide this document. See our privacy policy for how submitted documents are handled.</p>
      </div>
    </div>
  );
}