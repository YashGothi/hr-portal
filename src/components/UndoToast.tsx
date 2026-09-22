import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UndoToastProps {
  id: string | number;
  message: string;
  onUndo: () => void | Promise<void>;
  duration?: number;
}

let activeUndoToastId: string | number | null = null;

export function UndoToastContent({ id, message, onUndo, duration = 6000 }: UndoToastProps) {
  const [isUndoing, setIsUndoing] = useState(false);

  const handleUndo = async () => {
    try {
      setIsUndoing(true);
      await onUndo();
    } finally {
      toast.dismiss(id);
      if (activeUndoToastId === id) {
        activeUndoToastId = null;
      }
    }
  };

  return (
    <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-border bg-card p-3.5 shadow-xl text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground leading-snug">{message}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleUndo}
          disabled={isUndoing}
          className="h-8 shrink-0 gap-1.5 px-3 font-semibold border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary transition-colors"
        >
          <RotateCcw className="size-3.5" />
          {isUndoing ? "Reverting…" : "Undo"}
        </Button>
      </div>

      {/* Subtle countdown progress indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30">
        <div
          className="h-full bg-primary/60 transition-all ease-linear"
          style={{
            animation: `undoCountdown ${duration}ms linear forwards`,
          }}
        />
      </div>

      <style>{`
        @keyframes undoCountdown {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

/**
 * Dispatches a self-dismissing Undo toast at bottom-right with backend-authoritative rollback.
 * Dismisses any prior active undo action to prevent stale overlapping actions.
 */
export function showUndoToast({
  message,
  onUndo,
  duration = 6000,
}: {
  message: string;
  onUndo: () => void | Promise<void>;
  duration?: number;
}) {
  if (activeUndoToastId !== null) {
    toast.dismiss(activeUndoToastId);
  }

  const toastId = toast.custom(
    (t) => <UndoToastContent id={t} message={message} onUndo={onUndo} duration={duration} />,
    {
      duration,
      position: "bottom-right",
    },
  );

  activeUndoToastId = toastId;
  return toastId;
}
