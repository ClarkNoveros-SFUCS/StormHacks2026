"use client";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { openSonar } from "@/lib/sonar/client";

type Props = {
  /** Sent as the Player's first message. Omitted: Sonar gives its briefing for the page. */
  message?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/** "Ask Sonar 🐬": opens the Sonar drawer (components/sonar/SonarBuddy.tsx) with a message. */
export function AskSonarButton({ message, label = "Ask Sonar", variant = "secondary", size = "md", className }: Props) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      iconRight={<span>🐬</span>}
      onClick={() => openSonar(message ? { message } : {})}
    >
      {label}
    </Button>
  );
}
