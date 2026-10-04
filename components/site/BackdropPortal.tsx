"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders a fixed, full-viewport backdrop (a canvas behind the page) straight into <body>, so
 * the route transition's transform can never become its containing block. Client-only.
 */
export function BackdropPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
