import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkSenderDns, SENDER_SUBDOMAIN } from "@/lib/dns-check.functions";

/** Polls public DNS so email dispatch unlocks by itself once records go live. */
export function useSenderDns() {
  const run = useServerFn(checkSenderDns);
  const query = useQuery({
    queryKey: ["sender-dns"],
    queryFn: () => run(),
    refetchInterval: (result) => (result.state.data?.live ? false : 60_000),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  return { ...query, live: query.data?.live === true };
}

export function SenderDnsStatus() {
  const { data, isFetching, refetch, live } = useSenderDns();

  return (
    <section
      className={`panel p-4 sm:p-5 ${live ? "border-primary/30" : "border-destructive/40"}`}
      aria-labelledby="dns-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {live ? (
            <CheckCircle2 className="size-4 text-primary" />
          ) : (
            <ShieldAlert className="size-4 text-destructive" />
          )}
          <h2 id="dns-heading" className="text-sm font-semibold">
            Sender domain checks
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={live ? "default" : "outline"}>
            {live ? "Records live" : "Not live yet"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refetch()}
            aria-label="Re-check DNS records"
            title="Re-check now"
          >
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {live
          ? `${SENDER_SUBDOMAIN} is publicly verified, so sending is enabled.`
          : `Sending stays disabled until both records for ${SENDER_SUBDOMAIN} are publicly live. This re-checks automatically every minute.`}
      </p>

      <div className="mt-4 space-y-2">
        {(data?.records ?? []).map((record) => (
          <div
            key={record.name + record.type}
            className="rounded-md border border-border bg-secondary/30 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {record.label} <span className="text-muted-foreground">({record.type})</span>
              </span>
              <Badge variant={record.ok ? "default" : "destructive"}>
                {record.ok ? "Live" : "Missing"}
              </Badge>
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{record.name}</p>
            {!record.ok ? (
              <p className="mt-2 break-all text-xs text-muted-foreground">
                Expected: <span className="text-foreground">{record.expected.join(", ")}</span>
                {record.found.length > 0 ? (
                  <>
                    <br />
                    Currently published: {record.found.join(", ")}
                  </>
                ) : (
                  <>
                    <br />
                    Nothing published at this name yet.
                  </>
                )}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {data?.checkedAt ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Last checked {new Date(data.checkedAt).toLocaleTimeString()} via{" "}
          {data.resolvers.join(" and ")}.
        </p>
      ) : null}
    </section>
  );
}
