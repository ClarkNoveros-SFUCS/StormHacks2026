"use client";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { sfx } from "@/lib/ui/sfx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Props = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a Next `<Link>` instead of a `<button>`. */
  href?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Full width. */
  block?: boolean;
  /** Play the UI hover/click blips (default true). */
  sound?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-lg",
};

/**
 * The pixel button: stepped corners, a hard drop, squash on press and a spring on release.
 * Primary is the yellow CTA. Recipe: `.px-btn` in app/globals.css.
 */
export function Button({
  variant = "secondary",
  size = "md",
  href,
  icon,
  iconRight,
  block,
  sound = true,
  className = "",
  children,
  onClick,
  onMouseEnter,
  type = "button",
  ...rest
}: Props) {
  const cls = `px-btn ${SIZE[size]} ${block ? "w-full" : ""} ${className}`;
  const inner = (
    <>
      {icon && <span aria-hidden="true" className="inline-flex">{icon}</span>}
      <span>{children}</span>
      {iconRight && <span aria-hidden="true" className="inline-flex">{iconRight}</span>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        data-variant={variant}
        onMouseEnter={sound ? () => sfx.hover() : undefined}
        onClick={sound ? () => sfx.click() : undefined}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type={type}
      className={cls}
      data-variant={variant}
      onMouseEnter={(e) => {
        if (sound) sfx.hover();
        onMouseEnter?.(e);
      }}
      onClick={(e) => {
        if (sound) sfx.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {inner}
    </button>
  );
}
