import { BackdropPortal } from "@/components/site/BackdropPortal";
import { SkyBackdrop } from "@/components/ui/SkyBackdrop";

// Explore is public (Q24). The site nav (F19) covers signed-out visitors too (Explore, Daily,
// Sign in, Start playing), so this layout only adds the living sky, portalled to <body>.
export default function ExploreLayout({ children }: LayoutProps<"/explore">) {
  return (
    <>
      <BackdropPortal>
        <SkyBackdrop intensity={0.55} />
      </BackdropPortal>
      {children}
    </>
  );
}
