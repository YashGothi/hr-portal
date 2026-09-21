import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Copy,
  FileCheck,
  FilePlus,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
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
import { createOffer, getCandidateOffers, revokeOffer, sendOffer } from "@/lib/offer.functions";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "border-border bg-secondary text-secondary-foreground",
  SENT: "border-primary/40 bg-primary/15 text-primary",
  ACCEPTED: "border-success/40 bg-success/15 text-success font-semibold",
  DECLINED: "border-destructive/40 bg-destructive/15 text-destructive",
  EXPIRED: "border-warning/40 bg-warning/15 text-warning",
  REVOKED: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function CandidateOffer({
  candidateId,
  candidateName,
  jobTitle,
  jobId,
}: {
  candidateId: string;
  candidateName: string;
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
  const [currency, setCurrency] = useState("INR");
  const [startDate, setStartDate] = useState("");

  // Default expiration to 7 days from today
  const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [notes, setNotes] = useState("");

  const offersQuery = useQuery({
    queryKey: ["candidate-offers", candidateId],
    queryFn: async () => fetchOffers({ data: { candidateId } }),
  });

  const createMutation = useMutation({
    mutationFn: async (sendImmediately: boolean) => {
      const compNum = parseFloat(compensation);
      if (isNaN(compNum) || compNum <= 0) {
        throw new Error("Please enter a valid positive compensation number.");
      }
      if (!startDate) throw new Error("Start date is required.");
      if (!expiresAt) throw new Error("Expiration date is required.");

      // 1. Create offer
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

      // 2. If requested, send immediately
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
      setCompensation("");
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

  const isLoading = offersQuery.isLoading;
  const data = offersQuery.data;
  const eligibility = data?.eligibility;
  const isEligible = eligibility?.eligible ?? false;
  const activeOffer = eligibility?.activeOffer;
  const offersList = data?.offers ?? [];
  const eventsList = data?.events ?? [];

  return (
    <section className="panel p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Award className="size-4 text-primary" /> Offer & Hiring Lifecycle
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="candidateName">Candidate</Label>
                  <Input id="candidateName" value={candidateName} disabled className="bg-muted" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="jobTitle">Position</Label>
                  <Input
                    id="jobTitle"
                    value={jobTitle || "Job Opening"}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="compensation">Compensation *</Label>
                  <div className="flex gap-2">
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR (₹)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      id="compensation"
                      type="number"
                      placeholder="e.g. 1500000"
                      value={compensation}
                      onChange={(e) => setCompensation(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="expiresAt">Offer Expiration Date *</Label>
                  <Input
                    id="expiresAt"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="notes">Terms & Conditions / Notes</Label>
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
                  onClick={() => createMutation.mutate(true)}
                  disabled={createMutation.isPending}
                >
                  <Send className="size-3.5 mr-1.5" /> Create & Send Offer
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
