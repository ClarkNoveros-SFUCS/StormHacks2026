import { BackdropPortal } from "@/components/site/BackdropPortal";
import { SkyBackdrop } from "@/components/ui/SkyBackdrop";

// The Modules pages sit on the living sky (design-system.md §2.5). The root layout's
// RouteTransition (F19) already plays the page-in animation, and the backdrop is portalled to
// <body> like F19's and F26's so no transformed ancestor traps it.
export default function ModulesLayout({ children }: LayoutProps<"/modules">) {
  return (
    <>
      <BackdropPortal>
        <SkyBackdrop intensity={0.55} />
      </BackdropPortal>
      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-24 sm:px-6 sm:pt-10">{children}</div>
    </>
  );
}
