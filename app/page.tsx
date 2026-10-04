import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// The only public page. Signed-in Players go straight to their Modules.
export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/modules");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-semibold">StormHacks 2026</h1>
      <div className="flex gap-3">
        <SignInButton mode="modal" forceRedirectUrl="/modules">
          <button className="rounded-md bg-black px-4 py-2 text-white">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl="/modules">
          <button className="rounded-md border px-4 py-2">Sign up</button>
        </SignUpButton>
      </div>
    </main>
  );
}
