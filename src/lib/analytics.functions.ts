import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calculateAnalyticsDashboard,
  type AnalyticsDashboardData,
  type DateRangePreset,
} from "./analytics/analytics.server";

const DateRangePresetSchema = z.enum([
  "today",
  "7d",
  "30d",
  "90d",
  "this_year",
  "all_time",
  "all",
  "custom",
]);

/**
 * Staff-Protected Analytics Data Server Function.
 * Strict Read-Only pipeline metrics.
 */
export const getAnalyticsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data?: {
      jobId?: string | null;
      preset?: DateRangePreset;
      from?: string | null;
      to?: string | null;
    }) => {
      if (!data) return {};
      return z
        .object({
          jobId: z.string().uuid().nullable().optional(),
          preset: DateRangePresetSchema.optional(),
          from: z.string().nullable().optional(),
          to: z.string().nullable().optional(),
        })
        .parse(data);
    },
  )
  .handler(async ({ data, context }): Promise<AnalyticsDashboardData> => {
    // Enforce authenticated staff user
    if (!context.userId) {
      throw new Error("Unauthorized: Staff credentials required to view analytics.");
    }

    const result = await calculateAnalyticsDashboard(context.supabase, {
      jobId: data?.jobId ?? null,
      dateRange: {
        preset: data?.preset ?? "30d",
        from: data?.from ?? null,
        to: data?.to ?? null,
      },
    });

    return result;
  });
