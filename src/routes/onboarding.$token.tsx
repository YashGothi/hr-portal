import { useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  FileUp,
  Loader2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getOnboardingPortalData, uploadCandidateDocumentAction } from "@/lib/onboarding.functions";
import type { PublicOnboardingPortalData } from "@/lib/onboarding/onboarding.server";

export const Route = createFileRoute("/onboarding/$token")({
  head: () => ({
    meta: [
      { title: "Candidate Onboarding Portal | aiHIVE" },
      {
        name: "description",
        content: "Review your requirements and submit verified compliance onboarding documents.",
      },
      { property: "og:title", content: "Candidate Onboarding Portal | aiHIVE" },
      {
        property: "og:description",
        content: "Review your requirements and submit verified compliance onboarding documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CandidateOnboardingPortal,
});

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CandidateOnboardingPortal() {
  const { token } = useParams({ from: "/onboarding/$token" });
  const queryClient = useQueryClient();

  const fetchPortalData = useServerFn(getOnboardingPortalData);
  const uploadDocFn = useServerFn(uploadCandidateDocumentAction);

  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  const portalQuery = useQuery<PublicOnboardingPortalData>({
    queryKey: ["candidate-onboarding-portal", token],
    queryFn: async () => {
      return fetchPortalData({ data: { token } });
    },
    retry: 1,
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: {
      documentId: string;
      fileName: string;
      mimeType: string;
      fileBase64: string;
    }) => {
      return uploadDocFn({
        data: {
          token,
          documentId: payload.documentId,
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          fileBase64: payload.fileBase64,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding-portal", token] });
      toast.success("Document uploaded successfully! It is now pending review.");
      setUploadingDocId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to upload document.");
      setUploadingDocId(null);
    },
  });

  const handleFileUpload = (docId: string, file: File) => {
    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File size exceeds 8 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }

    // Validate MIME type
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      toast.error("Invalid file format. Please upload a PDF, PNG, or JPEG file.");
      return;
    }

    setUploadingDocId(docId);

    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result as string) || "";
      const base64 = (result.includes(",") ? result.split(",")[1] : result) || "";

      uploadMutation.mutate({
        documentId: docId,
        fileName: file.name,
        mimeType: file.type,
        fileBase64: base64,
      });
    };
    reader.onerror = () => {
      toast.error("Failed to read file.");
      setUploadingDocId(null);
    };
    reader.readAsDataURL(file);
  };

  // Loading state
  if (portalQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground font-medium">
          Loading onboarding portal...
        </p>
      </div>
    );
  }

  // Error / Expired state
  if (portalQuery.isError || !portalQuery.data) {
    const errorMessage = portalQuery.error instanceof Error ? portalQuery.error.message : "";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="size-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Onboarding Link Unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorMessage || "This invitation link is invalid, has expired, or was revoked."}
          </p>
          <div className="mt-6 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
            If you believe this is an error, please contact your talent acquisition coordinator or
            HR representative to request a new onboarding link.
          </div>
        </div>
      </div>
    );
  }

  const portal = portalQuery.data;
  const { candidate, job, start_date, status, documents } = portal;

  const totalRequired = documents.filter((d) => d.is_required).length;
  const verifiedRequired = documents.filter(
    (d) => d.is_required && d.document_status === "VERIFIED",
  ).length;
  const submittedRequired = documents.filter(
    (d) =>
      d.is_required && (d.document_status === "PENDING_REVIEW" || d.document_status === "VERIFIED"),
  ).length;

  const progressPercent =
    totalRequired > 0 ? Math.round((verifiedRequired / totalRequired) * 100) : 100;
  const isCompleted = status === "COMPLETED";

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 dark:bg-zinc-950">
      {/* Top Brand Bar */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Brand />
          <Badge
            variant="outline"
            className={
              isCompleted
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                : "border-primary/30 bg-primary/10 text-primary font-medium"
            }
          >
            {isCompleted ? "Onboarding Completed" : "Candidate Portal"}
          </Badge>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        {/* Welcome Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 size-64 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="size-3.5" /> Welcome to the Team
              </span>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {candidate.full_name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Briefcase className="size-4 text-primary/70" />
                  <span>
                    {job.title} {job.department ? `• ${job.department}` : ""}
                  </span>
                </div>
                {start_date ? (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-4 text-primary/70" />
                    <span>
                      Target Start Date:{" "}
                      <strong className="text-foreground">
                        {new Date(start_date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </strong>
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Progress Pill */}
            <div className="flex flex-col items-start gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-4 sm:items-end">
              <span className="text-xs font-medium text-muted-foreground">
                Verification Progress
              </span>
              <span className="text-lg font-bold text-foreground">
                {verifiedRequired} of {totalRequired} Required
              </span>
              <div className="w-32">
                <Progress value={progressPercent} className="h-2" />
              </div>
            </div>
          </div>
        </div>

        {/* Celebration or Status Banner */}
        {isCompleted ? (
          <Alert className="mt-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            <AlertTitle className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
              Congratulations! Onboarding Complete
            </AlertTitle>
            <AlertDescription className="text-sm text-emerald-700/90 dark:text-emerald-300">
              All of your required compliance documents have been verified by HR. We look forward to
              your first day on{" "}
              {start_date ? new Date(start_date).toLocaleDateString() : "the scheduled date"}!
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="mt-6 border-primary/20 bg-primary/5 text-foreground">
            <ShieldCheck className="size-5 text-primary" />
            <AlertTitle className="text-sm font-semibold text-foreground">
              Document Compliance & Submission Instructions
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Please review each requirement below and upload clear, legible copies. Supported file
              types: <strong>PDF, PNG, JPG</strong> (up to <strong>8 MB</strong> per file).
            </AlertDescription>
          </Alert>
        )}

        {/* Document Requirements List */}
        <div className="mt-8 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Required Documents ({documents.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              {submittedRequired} of {totalRequired} submitted
            </span>
          </div>

          {documents.map((doc) => {
            const isUploading = uploadingDocId === doc.id;

            return (
              <DocumentRequirementCard
                key={doc.id}
                document={doc}
                isUploading={isUploading}
                isCompleted={isCompleted}
                onUpload={(file) => handleFileUpload(doc.id, file)}
              />
            );
          })}
        </div>

        {/* Footer Support Info */}
        <div className="mt-12 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          <p>
            Have questions about your onboarding documentation? Reach out directly to your recruiter
            or HR team.
          </p>
          <p className="mt-1">
            Secure transmission protected by 256-bit cryptographic token authentication.
          </p>
        </div>
      </main>
    </div>
  );
}

interface DocumentCardProps {
  document: PublicOnboardingPortalData["documents"][number];
  isUploading: boolean;
  isCompleted: boolean;
  onUpload: (file: File) => void;
}

function DocumentRequirementCard({
  document,
  isUploading,
  isCompleted,
  onUpload,
}: DocumentCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const status = document.document_status;
  const isVerified = status === "VERIFIED";
  const isPending = status === "PENDING_REVIEW";
  const isRejected = status === "REJECTED";
  const isNotSubmitted = status === "NOT_SUBMITTED";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isCompleted || isVerified) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isCompleted || isVerified) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file) onUpload(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) onUpload(file);
      // Reset input value so re-selecting same file triggers change
      e.target.value = "";
    }
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-200 ${
        isVerified
          ? "border-emerald-500/30 bg-card shadow-xs"
          : isRejected
            ? "border-rose-500/40 bg-rose-50/15 dark:bg-rose-950/10 shadow-xs"
            : isPending
              ? "border-amber-500/30 bg-card shadow-xs"
              : "border-border/80 bg-card shadow-xs hover:border-primary/30"
      }`}
    >
      <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                isVerified
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : isRejected
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : isPending
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {isVerified ? (
                <FileCheck2 className="size-4" />
              ) : isRejected ? (
                <AlertCircle className="size-4" />
              ) : isPending ? (
                <Clock className="size-4" />
              ) : (
                <FileText className="size-4" />
              )}
            </div>

            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                {document.title}
              </CardTitle>
              {document.description ? (
                <CardDescription className="text-xs text-muted-foreground">
                  {document.description}
                </CardDescription>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {document.is_required ? (
              <Badge variant="outline" className="border-border text-[11px] font-medium">
                Required
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border text-[11px] text-muted-foreground">
                Optional
              </Badge>
            )}

            {/* Status Badge */}
            {isVerified && (
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold gap-1">
                <CheckCircle2 className="size-3" /> Verified
              </Badge>
            )}
            {isPending && (
              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium gap-1">
                <Clock className="size-3" /> Under Review
              </Badge>
            )}
            {isRejected && (
              <Badge className="border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold gap-1">
                <AlertCircle className="size-3" /> Action Required
              </Badge>
            )}
            {isNotSubmitted && (
              <Badge variant="secondary" className="text-[11px] text-muted-foreground font-normal">
                Not Submitted
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
        {/* Rejection Review Notes Alert */}
        {isRejected && document.review_notes ? (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-900 dark:text-rose-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <div>
                <strong className="font-semibold text-rose-800 dark:text-rose-200">
                  Feedback from Recruiter:
                </strong>
                <p className="mt-0.5 whitespace-pre-wrap">{document.review_notes}</p>
                <p className="mt-1 text-[11px] font-medium text-rose-700/80 dark:text-rose-300/80">
                  Please upload an updated document addressing the feedback above.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Existing Upload Info */}
        {document.document_name ? (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="truncate font-medium text-foreground">{document.document_name}</span>
              {document.file_size_bytes ? (
                <span className="shrink-0 text-muted-foreground">
                  ({formatFileSize(document.file_size_bytes)})
                </span>
              ) : null}
            </div>

            {document.uploaded_at ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Uploaded {new Date(document.uploaded_at).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Upload Dropzone / Button Area */}
        {!isVerified && !isCompleted ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border border-dashed p-4 text-center transition-all ${
              isDragOver
                ? "border-primary bg-primary/10"
                : "border-border/90 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            {isUploading ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs font-medium text-primary">
                <Loader2 className="size-4 animate-spin" />
                <span>Uploading and verifying document...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                <UploadCloud className="size-6 text-muted-foreground" />
                <p className="text-xs font-medium text-foreground">
                  {document.document_name
                    ? "Upload replacement document"
                    : "Drag and drop or click to upload"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  PDF, PNG, or JPG (maximum file size 8 MB)
                </p>
              </div>
            )}
          </div>
        ) : isVerified ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="size-4" />
            <span>Document accepted and verified. No further action needed.</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
