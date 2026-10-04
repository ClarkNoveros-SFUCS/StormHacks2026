import { PageTransition } from "@/components/ui/PageTransition";
import { SkyBackdrop } from "@/components/ui/SkyBackdrop";

// The Modules pages sit on the living sky (design-system.md §2.5). If F19 moves the backdrop into
// the root layout, drop it here.
export default function ModulesLayout({ children }: LayoutProps<"/modules">) {
  return (
    <>
      <SkyBackdrop intensity={0.55} />
      <PageTransition className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
        {children}
      </PageTransition>
    </>
  );
}
