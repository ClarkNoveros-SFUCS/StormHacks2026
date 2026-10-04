import type { ReactNode } from "react";

type Props = { title?: ReactNode; action?: ReactNode; className?: string; children?: ReactNode };

/** A titled section card. The title is a pixel label with a dashed hairline; `action` sits on the right. */
export function Panel({ title, action, className = "", children }: Props) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center gap-3">
          {title && <h2 className="label-line flex-1 !text-[13px]">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
