"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders fixed layers (a backdrop canvas behind the page, the nav's menu sheet) straight into
 * <body>, so an ancestor's transform or backdrop-filter can never become their containing
 * block. Client-only.
 */
export function BackdropPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
