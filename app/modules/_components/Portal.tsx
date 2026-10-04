"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders overlays (dialogs, the file viewer) into <body>. The layout's PageTransition animates a
 * transform, which would otherwise make it the containing block of `position: fixed` children.
 */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return mounted ? createPortal(children, document.body) : null;
}
