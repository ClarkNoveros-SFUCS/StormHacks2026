"use client";
import { useClerk } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui";

/** Opens Clerk's sign-in modal and comes back to this page afterwards (or `returnTo`). */
export function useSignInPrompt() {
  const clerk = useClerk();
  const pathname = usePathname();
  return useCallback(
    (returnTo?: string) => {
      const url = returnTo ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : pathname);
      clerk.openSignIn({ forceRedirectUrl: url, signUpForceRedirectUrl: url });
    },
    [clerk, pathname],
  );
}

type Props = { label?: string; size?: ButtonSize; variant?: ButtonVariant; block?: boolean; className?: string };

/** A pixel button that opens the sign-in modal (signed-out visitors on public Explore pages). */
export function SignInCta({ label = "Sign in to play", size = "md", variant = "primary", block, className }: Props) {
  const prompt = useSignInPrompt();
  return (
    <Button variant={variant} size={size} block={block} className={className} onClick={() => prompt()}>
      {label}
    </Button>
  );
}
