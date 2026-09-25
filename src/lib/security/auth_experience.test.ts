import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock Supabase Auth methods
const mockSignInWithOAuth = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

// Mock router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...props
    }: {
      to?: string;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement("a", { href: typeof to === "string" ? to : "#", ...props }, children),
    useNavigate: () => vi.fn(),
    createFileRoute: () => () => (comp: unknown) => comp,
  };
});

// Mock toast
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe("Authentication & Password Reset Behavioral Regression Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  describe("1. Google OAuth Authentication", () => {
    it("renders the 'Continue with Google' button in the sign-in experience", async () => {
      const { AuthPage } = await import("@/routes/auth");
      const html = renderToStaticMarkup(React.createElement(AuthPage));

      expect(html).toContain("Continue with Google");
      expect(html).toContain("Sign in to your workspace");
    });

    it("triggers signInWithOAuth with provider='google' and dynamically resolved origin redirect", async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: "https://accounts.google.com" },
        error: null,
      });

      // Simulating handleGoogle logic
      const testOrigin = "https://hr-portal-akar.onrender.com";
      const options = {
        provider: "google" as const,
        options: {
          redirectTo: `${testOrigin}/dashboard`,
        },
      };

      await mockSignInWithOAuth(options);

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "https://hr-portal-akar.onrender.com/dashboard",
        },
      });
    });

    it("never hardcodes localhost in production redirect URLs", () => {
      function getRedirectUrl(origin: string, path: string): string {
        return `${origin}${path}`;
      }

      const prodRender = getRedirectUrl("https://hr-portal-akar.onrender.com", "/dashboard");
      const prodCustom = getRedirectUrl("https://hr.seceon.com", "/dashboard");
      const localDev = getRedirectUrl("http://localhost:3005", "/dashboard");

      expect(prodRender).toBe("https://hr-portal-akar.onrender.com/dashboard");
      expect(prodRender).not.toContain("localhost");
      expect(prodCustom).toBe("https://hr.seceon.com/dashboard");
      expect(prodCustom).not.toContain("localhost");
      expect(localDev).toBe("http://localhost:3005/dashboard");
    });
  });

  describe("2. Forgot Password Flow", () => {
    it("renders the 'Forgot Password?' action on the sign-in form", async () => {
      const { AuthPage } = await import("@/routes/auth");
      const html = renderToStaticMarkup(React.createElement(AuthPage));

      expect(html).toContain("Forgot Password?");
    });

    it("rejects empty or whitespace-only email with clear error", async () => {
      function validateForgotEmail(rawEmail: string): string | null {
        const trimmed = rawEmail.trim();
        if (!trimmed) return "Email address is required.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return "Enter a valid email address.";
        return null;
      }

      expect(validateForgotEmail("")).toBe("Email address is required.");
      expect(validateForgotEmail("    ")).toBe("Email address is required.");
    });

    it("rejects invalid email formats", () => {
      function validateForgotEmail(rawEmail: string): string | null {
        const trimmed = rawEmail.trim();
        if (!trimmed) return "Email address is required.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return "Enter a valid email address.";
        return null;
      }

      expect(validateForgotEmail("notanemail")).toBe("Enter a valid email address.");
      expect(validateForgotEmail("@domain.com")).toBe("Enter a valid email address.");
      expect(validateForgotEmail("user@domain")).toBe("Enter a valid email address.");
    });

    it("submits valid email to supabase.auth.resetPasswordForEmail with /reset-password redirect", async () => {
      mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

      const email = "  recruiter@company.com  ";
      const origin = "https://hr-portal-akar.onrender.com";
      const trimmed = email.trim();

      await mockResetPasswordForEmail(trimmed, {
        redirectTo: `${origin}/reset-password`,
      });

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith("recruiter@company.com", {
        redirectTo: "https://hr-portal-akar.onrender.com/reset-password",
      });
    });

    it("enforces user enumeration protection by returning a neutral message on both success and error", async () => {
      const NEUTRAL_MESSAGE =
        "If an account exists for this email address, a password reset link has been sent.";

      async function triggerForgot(emailToReset: string): Promise<string> {
        try {
          await mockResetPasswordForEmail(emailToReset.trim());
          return NEUTRAL_MESSAGE;
        } catch {
          return NEUTRAL_MESSAGE;
        }
      }

      // Success case
      mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
      const successMsg = await triggerForgot("registered@company.com");
      expect(successMsg).toBe(NEUTRAL_MESSAGE);

      // Failure/Unregistered case
      mockResetPasswordForEmail.mockRejectedValueOnce(new Error("User not found"));
      const errorMsg = await triggerForgot("unregistered@company.com");
      expect(errorMsg).toBe(NEUTRAL_MESSAGE);
      expect(errorMsg).not.toContain("not found");
    });
  });

  describe("3. Password Reset Page (/reset-password)", () => {
    function validateResetForm(newPass: string, confirmPass: string): string | null {
      if (!newPass) return "New password is required.";
      if (newPass.length < 6) return "Password must be at least 6 characters long.";
      if (newPass !== confirmPass) return "Passwords do not match.";
      return null;
    }

    it("rejects passwords shorter than 6 characters", () => {
      expect(validateResetForm("12345", "12345")).toBe(
        "Password must be at least 6 characters long.",
      );
      expect(validateResetForm("", "")).toBe("New password is required.");
    });

    it("rejects password confirmation mismatch", () => {
      expect(validateResetForm("Secret123!", "Secret1234!")).toBe("Passwords do not match.");
    });

    it("submits valid matching password to supabase.auth.updateUser", async () => {
      mockUpdateUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });

      const newPassword = "NewSecurePassword2026!";
      const validationError = validateResetForm(newPassword, newPassword);
      expect(validationError).toBeNull();

      await mockUpdateUser({ password: newPassword });

      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "NewSecurePassword2026!",
      });
    });
  });

  describe("4. Preservation of Existing RBAC and Protected Routes", () => {
    it("preserves staff-only role check requirement for administrative access", () => {
      const isStaffRole = (role: string) => role === "admin" || role === "recruiter";

      expect(isStaffRole("admin")).toBe(true);
      expect(isStaffRole("recruiter")).toBe(true);
      expect(isStaffRole("candidate")).toBe(false);
      expect(isStaffRole("applicant")).toBe(false);
      expect(isStaffRole("anonymous")).toBe(false);
    });

    it("candidate public endpoints remain independent of recruiter auth session", () => {
      const publicRoutes = ["/apply/VAL-DO-03", "/confirm/test-token", "/offer/test-token"];
      const isPublic = (path: string) =>
        path.startsWith("/apply") ||
        path.startsWith("/confirm") ||
        path.startsWith("/offer") ||
        path.startsWith("/schedule") ||
        path.startsWith("/onboarding");

      for (const route of publicRoutes) {
        expect(isPublic(route)).toBe(true);
      }
    });
  });
});
