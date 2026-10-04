import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { listModuleGames } from "@/lib/games/queries";
import { cardProgress, getModule, listModuleDocuments } from "../_lib/queries";
import { ModuleWorkspace } from "../_components/ModuleWorkspace";

export async function generateMetadata(props: PageProps<"/modules/[moduleId]">): Promise<Metadata> {
  const playerId = await requirePlayer();
  const mod = await getModule(playerId, (await props.params).moduleId);
  return { title: mod ? `${mod.name} · SYLLABYSS` : "Module · SYLLABYSS" };
}

/** Module page: Files (upload, viewer) + Games (cards, New Game). `?doc=&page=` opens the file viewer. */
export default async function ModulePage(props: PageProps<"/modules/[moduleId]">) {
  const playerId = await requirePlayer();
  const { moduleId } = await props.params;
  const mod = await getModule(playerId, moduleId);
  if (!mod) notFound();

  const [documents, games, search] = await Promise.all([
    listModuleDocuments(playerId, mod.id),
    listModuleGames(playerId, mod.id),
    props.searchParams,
  ]);
  const progress = await cardProgress(
    playerId,
    games.map((g) => g.id),
  );

  const doc = typeof search.doc === "string" ? search.doc : null;
  const page = Number(typeof search.page === "string" ? search.page : 1);

  return (
    <ModuleWorkspace
      key={mod.id}
      module={mod}
      initialDocuments={documents}
      initialGames={games.map((g) => ({
        ...g,
        created_at: new Date(g.created_at).toISOString(),
      }))}
      progress={progress}
      initialViewer={doc ? { docId: doc, page: Number.isInteger(page) && page > 0 ? page : 1 } : null}
    />
  );
}
