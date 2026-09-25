import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password | aiHIVE" },
      {
        name: "description",
        content: "Set a new password for your aiHIVE recruiter account.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  useEffect(() => {
    // Listen for recovery event or active session from recovery link
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasRecoverySession(true);
      } else {
        // If hash contains access_token or recovery type, Supabase is currently processing it
        const isRecoveryHash =
          typeof window !== "undefined" &&
          (window.location.hash.includes("type=recovery") ||
            window.location.hash.includes("access_token=") ||
            window.location.search.includes("code="));
        if (!isRecoveryHash) {
          setHasRecoverySession(false);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!newPassword) {
      toast.error("New password is required.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      toast.success("Password updated successfully.");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update password. Your reset link may have expired.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm panel p-7">
        <Brand />
        <h1 className="mt-2 text-2xl font-semibold">Set new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your new password below to update your account.
        </p>

        {hasRecoverySession === false ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
              No active recovery session found. Please request a new password reset link.
            </div>
            <Button asChild className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleUpdatePassword}>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Updating..." : "Update Password"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link to="/auth" className="hover:underline">
                Cancel and return to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
