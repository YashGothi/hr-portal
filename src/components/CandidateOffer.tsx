import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Award,
  Calendar as CalendarIcon,
  Copy,
  Eye,
  FilePlus,
  Loader2,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createOffer, getCandidateOffers, revokeOffer, sendOffer } from "@/lib/offer.functions";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "border-border bg-secondary text-secondary-foreground",
  SENT: "border-primary/40 bg-primary/15 text-primary",
  ACCEPTED: "border-success/40 bg-success/15 text-success font-semibold",
  DECLINED: "border-destructive/40 bg-destructive/15 text-destructive",
  EXPIRED: "border-warning/40 bg-warning/15 text-warning",
  REVOKED: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

/** Formats a YYYY-MM-DD date string as dd-MM-yyyy without timezone conversion. */
function formatDisplayDate(isoDate: string | undefined | null): string {
  if (!isoDate) return "";
  const dateOnly = isoDate.split("T")[0];
  if (!dateOnly) return isoDate;
  const parts = dateOnly.split("-");
  const yyyy = parts[0];
  const mm = parts[1];
  const dd = parts[2];
  if (yyyy && mm && dd) {
    return `${dd}-${mm}-${yyyy}`;
  }
  return isoDate;
}

/** Parses YYYY-MM-DD into a local Date object matching the exact day. */
function parseIsoToLocalDate(isoDate: string | undefined | null): Date | undefined {
  if (!isoDate) return undefined;
  const dateOnly = isoDate.split("T")[0];
  if (!dateOnly) return undefined;
  const parts = dateOnly.split("-");
  const yPart = parts[0];
  const mPart = parts[1];
  const dPart = parts[2];
  if (yPart && mPart && dPart) {
    const yyyy = parseInt(yPart, 10);
    const mm = parseInt(mPart, 10) - 1;
    const dd = parseInt(dPart, 10);
    return new Date(yyyy, mm, dd);
  }
  return undefined;
}

export function CandidateOffer({
  candidateId,
  candidateName,
  candidateEmail,
  jobTitle,
  jobId,
}: {
  candidateId: string;
  candidateName: string;
  candidateEmail?: string | null;
  jobTitle?: string | null;
  jobId?: string | null;
}) {
  const queryClient = useQueryClient();
  const fetchOffers = useServerFn(getCandidateOffers);
  const createFn = useServerFn(createOffer);
  const sendFn = useServerFn(sendOffer);
  const revokeFn = useServerFn(revokeOffer);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [compensation, setCompensation] = useState("");
  const [isCompFocused, setIsCompFocused] = useState(false);
  const [compTouched, setCompTouched] = useState(false);
  const [currency, setCurrency] = useState("INR");
  const [startDate, setStartDate] = useState("");
  const [isStartDatePopoverOpen, setIsStartDatePopoverOpen] = useState(false);
  const [startDateTouched, setStartDateTouched] = useState(false);

  // Default expiration to 7 days from today
  const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [isExpiresAtPopoverOpen, setIsExpiresAtPopoverOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const [hasAttemptedAction, setHasAttemptedAction] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const offersQuery = useQuery({
    queryKey: ["candidate-offers", candidateId],
    queryFn: async () => fetchOffers({ data: { candidateId } }),
  });

  const effectiveCandidateEmail =
    candidateEmail || offersQuery.data?.eligibility?.candidate?.email || "candidate@example.com";
  const effectiveJobTitle =
    jobTitle || offersQuery.data?.eligibility?.candidate?.applied_role || "Job Opening";

  const compNum = parseFloat(compensation);
  const isCompValid = !isNaN(compNum) && compNum > 0;
  const compError =
    compTouched || hasAttemptedAction
      ? !compensation.trim()
        ? "Annual compensation is required."
        : !isCompValid
          ? "Please enter a valid positive compensation number."
          : null
      : null;

  const isStartDateValid = Boolean(startDate);
  const startDateError =
    startDateTouched || hasAttemptedAction ? (!startDate ? "Start date is required." : null) : null;

  const createMutation = useMutation({
    mutationFn: async (sendImmediately: boolean) => {
      setHasAttemptedAction(true);
      if (!isCompValid) {
        throw new Error("Please enter a valid positive compensation number.");
      }
      if (!startDate) throw new Error("Start date is required.");
      if (!expiresAt) throw new Error("Expiration date is required.");

      // 1. Create offer via existing authoritative backend function
      const { offer } = await createFn({
        data: {
          candidateId,
          jobId: jobId || null,
          compensation: compNum,
          currency,
          startDate,
          expiresAt: new Date(expiresAt + "T23:59:59Z").toISOString(),
          notes: notes.trim() || null,
        },
      });

      // 2. If requested, send immediately via existing backend send function
      if (sendImmediately && offer) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        await sendFn({ data: { offerId: offer.id, origin } });
      }

      return { offer, sendImmediately };
    },
    onSuccess: ({ sendImmediately }) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-offers", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success(
        sendImmediately ? "Offer created and sent to candidate!" : "Offer draft saved.",
      );
      setIsFormOpen(false);
      setIsPreviewOpen(false);
      setCompensation("");
      setCompTouched(false);
      setStartDateTouched(false);
      setHasAttemptedAction(false);
      setNotes("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return sendFn({ data: { offerId, origin } });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-offers", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      if (result.emailSent) {
        toast.success("Offer sent to candidate email!");
      } else {
        toast.info("Offer marked as SENT", {
          description:
            result.emailError || "Email could not be delivered. Share the link manually.",
        });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (offerId: string) => revokeFn({ data: { offerId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-offers", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Offer revoked.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleOpenPreview() {
    setHasAttemptedAction(true);
    setCompTouched(true);
    setStartDateTouched(true);

    if (!isCompValid) {
      toast.error("Please enter a valid positive compensation number before previewing.");
      return;
    }
    if (!startDate) {
      toast.error("Start date is required before previewing.");
      return;
    }
    if (!expiresAt) {
      toast.error("Expiration date is required before previewing.");
      return;
    }
    setIsPreviewOpen(true);
  }

  const isLoading = offersQuery.isLoading;
  const data = offersQuery.data;
  const eligibility = data?.eligibility;
  const isEligible = eligibility?.eligible ?? false;
  const activeOffer = eligibility?.activeOffer;
  const offersList = data?.offers ?? [];

  return (
    <section className="panel p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Award className="size-4 text-primary" /> Offer &amp; Hiring Lifecycle
        </h3>
        {activeOffer && (
          <Badge className={`text-xs ${STATUS_BADGE[activeOffer.status]}`}>
            {activeOffer.status === "SENT"
              ? "Offer Sent"
              : activeOffer.status === "ACCEPTED"
                ? "Offer Accepted"
                : activeOffer.status === "DECLINED"
                  ? "Offer Declined"
                  : activeOffer.status}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading offer data...
        </div>
      ) : !isEligible ? (
        /* Ineligible Alert */
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="size-4 text-warning mt-0.5 shrink-0" />
            <div className="space-y-1 text-xs">
              <p className="font-medium text-foreground">Offer Ineligible</p>
              <p className="text-muted-foreground">{eligibility?.reason}</p>
              <p className="text-muted-foreground/80">
                Rule: Only candidates with ATS score &ge; 85 and a completed interview can receive
                an offer.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Eligible Experience */
        <div className="space-y-4">
          {/* Active Offer Card */}
          {activeOffer ? (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Active Offer
                  </span>
                  <p className="text-base font-bold text-foreground">
                    {activeOffer.currency} {Number(activeOffer.compensation).toLocaleString()}
                  </p>
                </div>
                <Badge className={STATUS_BADGE[activeOffer.status]}>{activeOffer.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Start: </span>
                  {new Date(activeOffer.start_date).toLocaleDateString()}
                </div>
                <div>
                  <span className="font-medium text-foreground">Expires: </span>
                  {new Date(activeOffer.expires_at).toLocaleDateString()}
                </div>
              </div>

              {activeOffer.notes && (
                <p className="rounded bg-muted/40 p-2 text-xs text-muted-foreground">
                  {activeOffer.notes}
                </p>
              )}

              {/* Secure Link actions */}
              {activeOffer.status === "SENT" && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "";
                      const url = `${origin}/offer/${activeOffer.secure_token}`;
                      void navigator.clipboard?.writeText(url);
                      toast.success("Offer link copied to clipboard");
                    }}
                  >
                    <Copy className="size-3.5 mr-1.5" /> Copy Candidate Link
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => sendMutation.mutate(activeOffer.id)}
                    disabled={sendMutation.isPending}
                  >
                    <Send className="size-3.5 mr-1.5" /> Resend Offer Email
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => revokeMutation.mutate(activeOffer.id)}
                    disabled={revokeMutation.isPending}
                  >
                    Revoke
                  </Button>
                </div>
              )}

              {activeOffer.status === "DRAFT" && (
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground font-semibold"
                    onClick={() => sendMutation.mutate(activeOffer.id)}
                    disabled={sendMutation.isPending}
                  >
                    <Send className="size-3.5 mr-1.5" /> Send Offer Now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => revokeMutation.mutate(activeOffer.id)}
                    disabled={revokeMutation.isPending}
                  >
                    Discard
                  </Button>
                </div>
              )}
            </div>
          ) : isFormOpen ? (
            /* Create Offer Form */
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <FilePlus className="size-4 text-primary" /> Create Formal Offer
              </h4>

              <div className="space-y-4">
                {/* Row 1: Candidate & Position */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="candidateName" className="text-xs font-medium">
                      Candidate
                    </Label>
                    <Input
                      id="candidateName"
                      value={candidateName}
                      disabled
                      className="h-10 bg-muted"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="jobTitle" className="text-xs font-medium">
                      Position
                    </Label>
                    <Input
                      id="jobTitle"
                      value={effectiveJobTitle}
                      disabled
                      className="h-10 bg-muted"
                    />
                  </div>
                </div>

                {/* Row 2: Annual Compensation & Start Date (Balanced Responsive Two-Column Layout) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {/* Left Column: Annual Compensation */}
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="compensation" className="text-xs font-medium">
                      Annual Compensation *
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger
                          className="h-10 w-24 sm:w-28 shrink-0 text-sm font-medium"
                          aria-label="Compensation currency"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INR">INR (₹)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex-1 min-w-0">
                        <Input
                          id="compensation"
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 1,500,000"
                          value={
                            isCompFocused
                              ? compensation
                              : compensation
                                ? Number(compensation).toLocaleString()
                                : ""
                          }
                          onFocus={() => setIsCompFocused(true)}
                          onBlur={() => {
                            setIsCompFocused(false);
                            setCompTouched(true);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, "").trim();
                            if (raw === "" || /^\d+(\.\d*)?$/.test(raw)) {
                              setCompensation(raw);
                            }
                          }}
                          className={cn(
                            "h-10 text-sm",
                            compError ? "border-destructive focus-visible:ring-destructive" : "",
                          )}
                          aria-invalid={Boolean(compError)}
                          aria-describedby={compError ? "compensation-error" : undefined}
                        />
                      </div>
                    </div>
                    <div className="min-h-[20px]">
                      {compError && (
                        <p
                          id="compensation-error"
                          role="alert"
                          className="text-xs text-destructive flex items-center gap-1"
                        >
                          <AlertCircle className="size-3 shrink-0" /> {compError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Start Date */}
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="startDate" className="text-xs font-medium">
                      Start Date *
                    </Label>
                    <Popover open={isStartDatePopoverOpen} onOpenChange={setIsStartDatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="startDate"
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-10 w-full justify-between font-normal text-left px-3 text-sm",
                            !startDate && "text-muted-foreground",
                            startDateError && "border-destructive focus-visible:ring-destructive",
                          )}
                          onClick={() => setStartDateTouched(true)}
                          aria-invalid={Boolean(startDateError)}
                          aria-describedby={startDateError ? "start-date-error" : undefined}
                        >
                          <span className="truncate">
                            {startDate ? formatDisplayDate(startDate) : "Select start date"}
                          </span>
                          <CalendarIcon className="size-4 text-muted-foreground ml-2 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50" align="start">
                        <Calendar
                          mode="single"
                          selected={parseIsoToLocalDate(startDate)}
                          onSelect={(nextDate) => {
                            if (nextDate) {
                              const yyyy = nextDate.getFullYear();
                              const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
                              const dd = String(nextDate.getDate()).padStart(2, "0");
                              setStartDate(`${yyyy}-${mm}-${dd}`);
                              setIsStartDatePopoverOpen(false);
                            } else {
                              setStartDate("");
                            }
                          }}
                          className="pointer-events-auto p-3"
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="min-h-[20px]">
                      {startDateError && (
                        <p
                          id="start-date-error"
                          role="alert"
                          className="text-xs text-destructive flex items-center gap-1"
                        >
                          <AlertCircle className="size-3 shrink-0" /> {startDateError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 3: Offer Expiration Date (Aligned with Row 2 columns) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="expiresAt" className="text-xs font-medium">
                      Offer Expiration Date *
                    </Label>
                    <Popover open={isExpiresAtPopoverOpen} onOpenChange={setIsExpiresAtPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="expiresAt"
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-10 w-full justify-between font-normal text-left px-3 text-sm",
                            !expiresAt && "text-muted-foreground",
                          )}
                        >
                          <span className="truncate">
                            {expiresAt ? formatDisplayDate(expiresAt) : "Select expiration date"}
                          </span>
                          <CalendarIcon className="size-4 text-muted-foreground ml-2 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50" align="start">
                        <Calendar
                          mode="single"
                          selected={parseIsoToLocalDate(expiresAt)}
                          onSelect={(nextDate) => {
                            if (nextDate) {
                              const yyyy = nextDate.getFullYear();
                              const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
                              const dd = String(nextDate.getDate()).padStart(2, "0");
                              setExpiresAt(`${yyyy}-${mm}-${dd}`);
                              setIsExpiresAtPopoverOpen(false);
                            } else {
                              setExpiresAt("");
                            }
                          }}
                          className="pointer-events-auto p-3"
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="min-h-[20px]">
                      <p className="text-[11px] text-muted-foreground">
                        Candidate has until this date to accept or decline.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Row 4: Terms & Conditions / Notes (Full-width) */}
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-medium">
                    Terms &amp; Conditions / Notes
                  </Label>
                  <Textarea
                    id="notes"
                    rows={3}
                    placeholder="Notice period, probation terms, or special joining bonuses..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                <Button
                  size="sm"
                  onClick={() => createMutation.mutate(false)}
                  disabled={createMutation.isPending}
                  variant="secondary"
                >
                  Save Draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenPreview}
                  disabled={createMutation.isPending}
                  className="gap-1.5"
                >
                  <Eye className="size-3.5" /> Preview Offer
                </Button>
                <Button
                  size="sm"
                  onClick={() => createMutation.mutate(true)}
                  disabled={createMutation.isPending}
                  className="gap-1.5"
                >
                  <Send className="size-3.5" /> Create &amp; Send Offer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFormOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
              </div>

              {/* Side-Effect-Free Offer Email Preview Modal */}
              <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                      <Eye className="size-4 text-primary" /> Offer Letter Preview
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Review the exact email that will be dispatched to the candidate. No email has
                      been sent.
                    </DialogDescription>
                  </DialogHeader>

                  {/* Recipient & Subject Header */}
                  <div className="rounded-lg border border-border bg-secondary/40 p-3.5 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                      <span className="text-muted-foreground font-medium">To:</span>
                      <span className="font-semibold text-foreground">
                        {effectiveCandidateEmail}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-muted-foreground font-medium">Subject:</span>
                      <span className="font-semibold text-foreground">
                        Offer Letter — {effectiveJobTitle}
                      </span>
                    </div>
                  </div>

                  {/* Exact Email Body Render matching offer-letter.tsx */}
                  <div className="rounded-lg border border-border bg-card p-5 space-y-4 text-sm text-foreground">
                    <div className="border-b border-border/60 pb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                        Seceon HR
                      </p>
                      <h3 className="text-lg font-bold text-foreground mt-0.5">Job Offer</h3>
                    </div>

                    <p className="font-medium">Dear {candidateName || "Candidate"},</p>

                    <p className="text-muted-foreground leading-relaxed text-xs sm:text-sm">
                      We are delighted to extend an offer for the position of{" "}
                      <strong>{effectiveJobTitle}</strong> at Seceon.
                      <br />
                      <br />
                      Please review the offer details and terms below. You can accept or decline
                      this offer directly using the secure link provided.
                    </p>

                    {/* Details Box */}
                    <div className="rounded-md border border-border/80 bg-secondary/30 p-4 space-y-2 text-xs leading-relaxed">
                      <div>
                        <span className="font-semibold text-foreground">Position: </span>
                        <span className="text-muted-foreground">{effectiveJobTitle}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">Annual Compensation: </span>
                        <span className="text-foreground font-bold">
                          {currency} {Number(compensation || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">Start Date: </span>
                        <span className="text-muted-foreground">
                          {startDate ? formatDisplayDate(startDate) : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">Offer Expiration: </span>
                        <span className="text-muted-foreground">
                          {expiresAt ? formatDisplayDate(expiresAt) : "—"}
                        </span>
                      </div>
                      {notes && (
                        <div>
                          <span className="font-semibold text-foreground">Notes / Terms: </span>
                          <span className="text-muted-foreground whitespace-pre-wrap">{notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Non-functional Placeholder for Secure Acceptance Link */}
                    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-4 text-center space-y-2">
                      <div className="inline-block rounded-md bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground cursor-not-allowed">
                        View &amp; Respond to Offer
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        Secure acceptance link will be generated when the offer is sent.
                      </p>
                    </div>

                    <div className="pt-2 text-xs text-muted-foreground space-y-0.5">
                      <p>Regards,</p>
                      <p className="font-semibold text-foreground">HR Team, Seceon</p>
                    </div>
                  </div>

                  <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPreviewOpen(false)}
                      disabled={createMutation.isPending}
                    >
                      Back to Edit
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await createMutation.mutateAsync(true);
                      }}
                      disabled={createMutation.isPending}
                      className="gap-1.5 font-semibold"
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      Create &amp; Send Offer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            /* Create Offer Button */
            <div>
              <Button size="sm" onClick={() => setIsFormOpen(true)}>
                <FilePlus className="size-4 mr-2" /> Prepare Offer
              </Button>
            </div>
          )}

          {/* Past Offers & Event History */}
          {offersList.length > 0 && (
            <div className="space-y-2 border-t border-border/60 pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Offer History ({offersList.length})
              </h4>
              <div className="space-y-2">
                {offersList.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 p-2.5 text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-semibold text-foreground">
                        {item.currency} {Number(item.compensation).toLocaleString()}
                      </span>
                      <p className="text-muted-foreground">
                        Created {new Date(item.created_at).toLocaleDateString()} · Start{" "}
                        {new Date(item.start_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={STATUS_BADGE[item.status]}>{item.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
