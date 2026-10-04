import { UserButton } from "@clerk/nextjs";
import { requirePlayer } from "@/lib/auth";

// Placeholder from F01 that proves auth + DB work end to end. F08 replaces this page.
export default async function ModulesPage() {
  const playerId = await requirePlayer();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <UserButton />
      <h1 className="text-2xl font-semibold">Modules</h1>
      <p className="text-sm text-gray-500">Signed in as Player {playerId}</p>
    </main>
  );
}
