import brandMark from "@/assets/hr-automate-mark.png";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/25 bg-primary/10">
        <img
          src={brandMark}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1024}
          height={1024}
          className="size-8 object-contain"
        />
      </span>
      {compact ? null : (
        <span className="font-display text-sm font-bold text-foreground">aiHIVE</span>
      )}
    </span>
  );
}
