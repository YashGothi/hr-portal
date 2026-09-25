import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "HR Team Sign In | aiHIVE" },
      {
        name: "description",
        content:
          "Sign in to aiHIVE to manage job openings, candidate stages, AI resume scores and document verification.",
      },
      { property: "og:title", content: "HR Team Sign In | aiHIVE" },
      {
        property: "og:description",
        content: "Secure sign in for recruiters using the aiHIVE hiring workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
          toast.error("Email address is required.");
          setBusy(false);
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
          toast.error("Enter a valid email address.");
          setBusy(false);
          return;
        }

        try {
          await supabase.auth.resetPasswordForEmail(trimmedEmail, {
            redirectTo: `${window.location.origin}/reset-password`,
          });
        } catch {
          // Swallow any backend error to prevent account enumeration
        }

        toast.success(
          "If an account exists for this email address, a password reset link has been sent.",
        );
        setMode("signin");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName || email },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/dashboard", replace: true });
        } else {
          toast.success("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed. Try again.");
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
        <h1 className="mt-2 text-2xl font-semibold">
          {mode === "signin"
            ? "Sign in to your workspace"
            : mode === "signup"
              ? "Create your HR account"
              : "Reset your password"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "forgot"
            ? "Enter your work email address to receive a password reset link."
            : "Recruiter access only. Candidates never sign in here."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Priya Sharma"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">{mode === "forgot" ? "Email Address" : "Work email"}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          {mode !== "forgot" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setMode("forgot")}
                  >
                    Forgot Password?
                  </button>
                ) : null}
              </div>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : "Send Reset Link"}
          </Button>
        </form>

        {mode !== "forgot" ? (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or{" "}
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button variant="secondary" className="w-full" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </Button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New to the team? " : "Already have an account? "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </>
        ) : (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode("signin")}
            >
              Back to sign in
            </button>
          </p>
        )}

        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">
            Back to overview
          </Link>
        </p>
      </div>
    </div>
  );
}
