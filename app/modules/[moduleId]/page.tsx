import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { listModuleGames } from "@/lib/games/queries";
import { studyHref } from "../_lib/files";
import { cardProgress, getModule, listModuleDocuments, moduleMap } from "../_lib/queries";
import { ModuleMapPanel } from "../_components/ModuleMapPanel";
import { ModuleWorkspace } from "../_components/ModuleWorkspace";

export async function generateMetadata(props: PageProps<"/modules/[moduleId]">): Promise<Metadata> {
  const playerId = await requirePlayer();
  const mod = await getModule(playerId, (await props.params).moduleId);
  return { title: mod ? `${mod.name} · SYLLABYSS` : "Module · SYLLABYSS" };
}

/** Module page: Files (upload) + Games (cards, New Game). Old `?doc=&page=` links go to the file's study page. */
export default async function ModulePage(props: PageProps<"/modules/[moduleId]">) {
  const playerId = await requirePlayer();
  const { moduleId } = await props.params;
  const mod = await getModule(playerId, moduleId);
  if (!mod) notFound();

  const [documents, games, map, search] = await Promise.all([
    listModuleDocuments(playerId, mod.id),
    listModuleGames(playerId, mod.id),
    moduleMap(playerId, mod.id),
    props.searchParams,
  ]);
  const progress = await cardProgress(
    playerId,
    games.map((g) => g.id),
  );

  const doc = typeof search.doc === "string" ? search.doc : null;
  const page = Number(typeof search.page === "string" ? search.page : 1);
  if (doc && documents.some((d) => d.id === doc)) redirect(studyHref(mod.id, doc, Number.isInteger(page) ? page : 1));

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
      missingDoc={!!doc}
      map={<ModuleMapPanel moduleId={mod.id} map={map} />}
    />
  );
}
