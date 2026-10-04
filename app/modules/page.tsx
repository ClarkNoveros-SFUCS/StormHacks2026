import type { Metadata } from "next";
import { requirePlayer } from "@/lib/auth";
import { listModules } from "./_lib/queries";
import { ModulesList } from "./_components/ModulesList";

export const metadata: Metadata = { title: "My Modules · SYLLABYSS" };

export default async function ModulesPage() {
  const playerId = await requirePlayer();
  const modules = await listModules(playerId);
  return <ModulesList modules={modules} />;
}
