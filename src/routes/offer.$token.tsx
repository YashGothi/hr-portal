import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  MapPin,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PublicOfferPayload } from "@/lib/offers/offers.server";

export const Route = createFileRoute("/offer/$token")({
  head: () => ({
    meta: [
      { title: "Review Your Job Offer | aiHIVE" },
      {
        name: "description",
        content: "Review and respond to your official employment offer.",
      },
      { property: "og:title", content: "Review Your Job Offer | aiHIVE" },
      {
        property: "og:description",
        content: "Review and respond to your official employment offer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfferPage,
});

function OfferPage() {
  const { token } = useParams({ from: "/offer/$token" });
  const queryClient = useQueryClient();

  const [confirmAction, setConfirmAction] = useState<"ACCEPT" | "DECLINE" | null>(null);

  const offerQuery = useQuery<PublicOfferPayload>({
    queryKey: ["public-offer", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/offer/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || "Could not load offer details.");
      }
      return res.json();
    },
    retry: 1,
  });

  const responseMutation = useMutation({
    mutationFn: async (action: "ACCEPT" | "DECLINE") => {
      const res = await fetch(`/api/public/offer/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Could not ${action.toLowerCase()} the offer.`);
      }
      return data;
    },
    onSuccess: (data, action) => {
      queryClient.invalidateQueries({ queryKey: ["public-offer", token] });
      if (action === "ACCEPT") {
        toast.success("Offer accepted!", {
          description: "Congratulations! Your acceptance has been submitted to the hiring team.",
        });
      } else {
        toast.info("Offer declined.", {
          description: "Your decision has been communicated to the hiring team.",
        });
      }
      setConfirmAction(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setConfirmAction(null);
    },
  });

  if (offerQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Loading your offer...</p>
      </div>
    );
  }

  if (offerQuery.isError || !offerQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full text-center space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">
          <Brand />
          <div className="flex justify-center pt-2">
            <XCircle className="size-12 text-destructive" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Offer Not Found</h2>
          <p className="text-sm text-muted-foreground">
            {offerQuery.error instanceof Error
              ? offerQuery.error.message
              : "This offer link is invalid, does not exist, or has been removed."}
          </p>
        </div>
      </div>
    );
  }

  const offer = offerQuery.data;
  const isAccepted = offer.status === "ACCEPTED";
  const isDeclined = offer.status === "DECLINED";
  const isRevoked = offer.status === "REVOKED";
  const isExpired = offer.isExpired || offer.status === "EXPIRED";
  const canRespond = offer.status === "SENT" && !isExpired;

  const formattedCompensation = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(offer.compensation);

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <Brand />
          <Badge
            variant={
              isAccepted
                ? "default"
                : isDeclined
                  ? "destructive"
                  : isExpired || isRevoked
                    ? "outline"
                    : "secondary"
            }
            className="text-xs"
          >
            {isAccepted
              ? "Accepted"
              : isDeclined
                ? "Declined"
                : isExpired
                  ? "Expired"
                  : isRevoked
                    ? "Revoked"
                    : "Active Offer"}
          </Badge>
        </div>

        {/* Status Callouts */}
        {isAccepted && (
          <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center space-y-2">
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <h2 className="text-xl font-bold text-success">Offer Accepted</h2>
            <p className="text-sm text-muted-foreground">
              Thank you, {offer.candidateName}! You accepted the offer for {offer.jobTitle} on{" "}
              {offer.acceptedAt ? new Date(offer.acceptedAt).toLocaleDateString() : "recently"}.
            </p>
            <p className="text-xs text-muted-foreground">
              Our onboarding team will be in touch with next steps and paperwork. Welcome aboard!
            </p>
          </div>
        )}

        {isDeclined && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center space-y-2">
            <XCircle className="mx-auto size-12 text-destructive" />
            <h2 className="text-xl font-bold text-destructive">Offer Declined</h2>
            <p className="text-sm text-muted-foreground">
              You declined this offer on{" "}
              {offer.declinedAt ? new Date(offer.declinedAt).toLocaleDateString() : "recently"}.
            </p>
            <p className="text-xs text-muted-foreground">
              We appreciate your time and consideration throughout the selection process and wish
              you the best.
            </p>
          </div>
        )}

        {isExpired && !isAccepted && !isDeclined && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-6 text-center space-y-2">
            <AlertTriangle className="mx-auto size-12 text-warning" />
            <h2 className="text-xl font-bold text-warning">Offer Expired</h2>
            <p className="text-sm text-muted-foreground">
              This employment offer expired on {new Date(offer.expiresAt).toLocaleDateString()}.
            </p>
            <p className="text-xs text-muted-foreground">
              If you have questions or require an extension, please contact your talent acquisition
              partner.
            </p>
          </div>
        )}

        {isRevoked && (
          <div className="rounded-xl border border-border bg-muted/40 p-6 text-center space-y-2">
            <AlertTriangle className="mx-auto size-12 text-muted-foreground" />
            <h2 className="text-xl font-bold">Offer Inactive</h2>
            <p className="text-sm text-muted-foreground">
              This offer has been withdrawn or updated by the talent acquisition team.
            </p>
          </div>
        )}

        {/* Main Offer Details Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Official Employment Offer
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {offer.jobTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {offer.department && (
                <span className="flex items-center gap-1">
                  <Briefcase className="size-4" /> {offer.department}
                </span>
              )}
              {offer.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-4" /> {offer.location}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4 border border-border/50">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="size-3.5" /> Total Compensation
              </span>
              <p className="text-lg font-bold text-foreground">
                {offer.currency} {formattedCompensation}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3.5" /> Proposed Start Date
              </span>
              <p className="text-lg font-bold text-foreground">
                {new Date(offer.startDate).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="size-3.5" /> Offer Valid Until
              </span>
              <p className="text-sm font-semibold text-foreground">
                {new Date(offer.expiresAt).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Terms / Notes */}
          {offer.notes && (
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="size-4 text-primary" /> Terms & Special Conditions
              </h3>
              <div className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed border border-border/40">
                {offer.notes}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {canRespond && (
            <div className="border-t border-border pt-6 space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                Please review the details carefully before submitting your response.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  className="flex-1 bg-success hover:bg-success/90 text-success-foreground font-semibold"
                  onClick={() => setConfirmAction("ACCEPT")}
                  disabled={responseMutation.isPending}
                >
                  <CheckCircle2 className="mr-2 size-5" /> Accept Offer
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmAction("DECLINE")}
                  disabled={responseMutation.isPending}
                >
                  <XCircle className="mr-2 size-5" /> Decline Offer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "ACCEPT"
                ? "Accept Employment Offer?"
                : "Decline Employment Offer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "ACCEPT"
                ? `You are about to accept the offer for ${offer.jobTitle} starting on ${new Date(
                    offer.startDate,
                  ).toLocaleDateString()}. This will confirm your intent to join.`
                : `Are you sure you wish to decline the offer for ${offer.jobTitle}? This action is final and will notify the talent acquisition team.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={responseMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction === "ACCEPT"
                  ? "bg-success hover:bg-success/90 text-success-foreground"
                  : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              }
              onClick={() => {
                if (confirmAction) responseMutation.mutate(confirmAction);
              }}
              disabled={responseMutation.isPending}
            >
              {responseMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Submitting...
                </>
              ) : confirmAction === "ACCEPT" ? (
                "Yes, Accept Offer"
              ) : (
                "Yes, Decline Offer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
