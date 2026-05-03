import { useState, type ReactNode, type MouseEvent } from "react";
import { Lock, MessageCircle } from "lucide-react";
import { useApproval } from "@/hooks/use-approval";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LockedFeatureProps {
  children: ReactNode;
  /** Short label used in the modal: "Send via WhatsApp", "QR codes", "Wallet" … */
  feature: string;
  /** Optional inline mode — wraps inline (e.g. inside a toolbar) instead of block */
  inline?: boolean;
  /** Pass-through className for the wrapper */
  className?: string;
}

const APPROVAL_EMAIL =
  import.meta.env.VITE_APPROVAL_CONTACT_EMAIL || "approvals@cephlow.online";

const APPROVAL_WA_NUMBER = import.meta.env.VITE_APPROVAL_WA_NUMBER || "";
const APPROVAL_WA_LINK = APPROVAL_WA_NUMBER
  ? `https://wa.me/${APPROVAL_WA_NUMBER.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("hi")}`
  : "";

/**
 * Wraps a feature/button. When the current user is unapproved, the wrapped
 * element is greyed-out + locked: clicks are intercepted and a modal explains
 * how to get approved. When approved, renders children unchanged.
 */
export function LockedFeature({ children, feature, inline, className = "" }: LockedFeatureProps) {
  const { isApproved, loading } = useApproval();
  const [open, setOpen] = useState(false);

  // While loading we render children without a lock to avoid flash-of-locked
  if (loading || isApproved) {
    return <>{children}</>;
  }

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const wrapperBase = inline ? "relative inline-flex" : "relative";

  return (
    <>
      <span
        className={`${wrapperBase} ${className}`}
        onClickCapture={handleClick}
        // Intercept all events so the wrapped button never runs its handler
        onMouseDownCapture={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <span className="opacity-50 pointer-events-none select-none">
          {children}
        </span>
        <span className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5 shadow-sm">
          <Lock className="h-3 w-3" />
        </span>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> {feature} is locked
            </DialogTitle>
            <DialogDescription>
              This feature is available to <strong>approved organizations</strong> only.
              <br />
              <br />
              To request approval, message our WhatsApp bot and pick the{" "}
              <strong>💬 Talk to Developer</strong> option. Share your organization
              name, website, signup email, and a short description of your use case.
              We&apos;ll review and approve usually within one business day.
              <br />
              <br />
              Prefer email? Reach us at{" "}
              <a href={`mailto:${APPROVAL_EMAIL}`} className="underline">{APPROVAL_EMAIL}</a>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {APPROVAL_WA_LINK && (
              <Button asChild variant="default">
                <a href={APPROVAL_WA_LINK} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" /> Open WhatsApp
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Render-prop variant: gives the caller a boolean + a function to open the
 * approval modal. Useful for buttons whose layout would break with the
 * default visual wrapper.
 */
export function useLockedFeatureGuard(feature: string) {
  const { isApproved, loading } = useApproval();
  const [open, setOpen] = useState(false);
  const guard = (fn: () => void) => () => {
    if (loading) return;
    if (!isApproved) {
      setOpen(true);
      return;
    }
    fn();
  };
  const modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> {feature} is locked
          </DialogTitle>
          <DialogDescription>
            This feature is available to <strong>approved organizations</strong> only.
            To request approval, message our WhatsApp bot and pick{" "}
            <strong>💬 Talk to Developer</strong> with your organization details.
            Or email{" "}
            <a href={`mailto:${APPROVAL_EMAIL}`} className="underline">{APPROVAL_EMAIL}</a>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          {APPROVAL_WA_LINK && (
            <Button asChild variant="default">
              <a href={APPROVAL_WA_LINK} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 mr-2" /> Open WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { isApproved: isApproved && !loading, guard, modal };
}
