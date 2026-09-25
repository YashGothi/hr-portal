import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewInterviewInvitation } from "@/lib/interview-invite.functions";
import { buildInterviewInvitationEmail } from "@/lib/interview-invitation";

/** HR-only preview and dispatch of the generated interview invitation email. */
export function InterviewEmailPreview({ candidateId }: { candidateId: string }) {
  const prepare = useServerFn(previewInterviewInvitation);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await prepare({ data: { candidateId } });
      const schedulingUrl = `${window.location.origin}/schedule/${result.token}?type=interview`;
      setEmail(
        buildInterviewInvitationEmail({
          candidateName: result.candidateName,
          jobTitle: result.jobTitle,
          schedulingUrl,
        }),
      );
      setOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not prepare the interview email.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
        <Mail className="size-4" />
        {loading ? "Preparing…" : "Preview interview email"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Interview invitation email</DialogTitle>
            <DialogDescription>
              Review the invitation and send it directly or copy the text.
            </DialogDescription>
          </DialogHeader>
          {email ? (
            <div className="space-y-3">
              <div>
                <p className="label-caps">Subject</p>
                <p className="mt-1 text-sm font-medium">{email.subject}</p>
              </div>
              <div>
                <p className="label-caps">Message</p>
                <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed">
                  {email.body}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(`${email.subject}\n\n${email.body}`)
                      .then(() => toast.success("Email copied to clipboard"))
                      .catch(() => toast.error("Could not copy the email"));
                  }}
                >
                  <Copy className="size-4" /> Copy email content
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
