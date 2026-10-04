import Link from "next/link";
import { EmptyState } from "@/components/social/EmptyState";

export default function ProfileNotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
      <EmptyState say="I searched every trench. Nobody by that name down here." title="No diver with that username">
        <div className="flex gap-4">
          <Link href="/friends?tab=find" className="font-display text-sm text-signal hover:underline">
            Search for friends →
          </Link>
          <Link href="/profile" className="font-display text-sm text-muted hover:text-text">
            Your profile
          </Link>
        </div>
      </EmptyState>
    </main>
  );
}
