import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Authenticated: read a single application by its application ID. */
export const Route = createFileRoute("/api/applications/$applicationId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ||
          process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
          "";
        const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "";
        if (!key || !url) {
          return Response.json({ error: "Server configuration missing" }, { status: 500 });
        }
        const supabase = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.delete("Authorization");
              headers.set("apikey", key);
              headers.set("Authorization", `Bearer ${token}`);
              return fetch(input, { ...init, headers });
            },
          },
        });

        const { data: user } = await supabase.auth.getUser(token);
        if (!user?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data, error } = await supabase
          .from("candidates")
          .select("*")
          .eq("application_code", params.applicationId.toUpperCase())
          .maybeSingle();

        if (error) return Response.json({ error: "Lookup failed" }, { status: 500 });
        if (!data) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json({ application: data }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
