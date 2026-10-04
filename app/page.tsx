import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

// The only public page. Signed-in Players go straight to their Modules.
export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/modules");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6">
      <Logo size="lg" />
      <p className="text-muted">Turn your notes into games. Rarer answers sink deeper.</p>
      <div className="flex gap-3">
        <SignInButton mode="modal" forceRedirectUrl="/modules">
          <button className="px-btn h-11 px-5" data-variant="primary">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl="/modules">
          <button className="px-btn h-11 px-5" data-variant="secondary">Sign up</button>
        </SignUpButton>
      </div>
    </main>
  );
}
