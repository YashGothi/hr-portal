import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  LogOut,
  Linkedin,
  CalendarDays,
  CalendarClock,
  Mail,
  BarChart3,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/queries";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { to: "/dashboard", label: "Dashboard", description: undefined, icon: LayoutDashboard },
  { to: "/candidates", label: "Pipeline", description: undefined, icon: Users },
  { to: "/calendar", label: "Calendar", description: undefined, icon: CalendarDays },
  {
    to: "/scheduling",
    label: "Scheduling",
    description: "Availability & bookings",
    icon: CalendarClock,
  },
  { to: "/jobs", label: "Openings", description: undefined, icon: Briefcase },
  { to: "/import", label: "LinkedIn", description: undefined, icon: Linkedin },
  {
    to: "/email-dispatch",
    label: "Email Dispatch",
    description: "Auto mailer & Templates",
    icon: Mail,
  },
  { to: "/analytics", label: "Analytics", description: "Reports & metrics", icon: BarChart3 },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "";
  const initial = displayName.charAt(0).toUpperCase() || "?";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="border-b border-sidebar-border bg-sidebar lg:flex lg:min-h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-5">
          <span
            title={profile?.email ?? undefined}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <Brand />
            <p className="truncate text-xs text-muted-foreground">{displayName || "Signed in"}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map(({ to, label, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className:
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              }}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block">{label}</span>
                {description ? (
                  <span className="block truncate text-[0.6875rem] font-normal text-muted-foreground">
                    {description}
                  </span>
                ) : null}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="border-b border-border">
          <div className="flex justify-end gap-2 px-4 pt-3 sm:px-6">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-5 pt-2 sm:px-6">
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        </header>
        <div className="px-4 py-6 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
