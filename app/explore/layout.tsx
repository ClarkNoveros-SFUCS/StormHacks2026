import { Logo } from "@/components/ui/Logo";
import { SkyBackdrop } from "@/components/ui/SkyBackdrop";
import { SignInCta } from "./_components/SignInCta";
import { viewer } from "./_lib/server";

// Explore is public (Q24). The root layout only shows its header when signed in, so signed-out
// visitors get a small bar here with the Logo and a sign-in button. The full nav is F19's.
export default async function ExploreLayout({ children }: LayoutProps<"/explore">) {
  const playerId = await viewer();
  return (
    <>
      <SkyBackdrop intensity={0.55} />
      {!playerId && (
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-4 sm:px-6">
          <Logo size="sm" href="/" />
          <SignInCta size="sm" label="Sign in" />
        </div>
      )}
      {children}
    </>
  );
}
