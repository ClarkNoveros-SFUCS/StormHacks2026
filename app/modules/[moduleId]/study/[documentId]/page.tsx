import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getPlayerDocument } from "@/lib/documents/queries";
import { listModuleGames } from "@/lib/games/queries";
import { getModule } from "../../../_lib/queries";
import { StudyNotes } from "../../../_components/StudyNotes";

export async function generateMetadata(props: PageProps<"/modules/[moduleId]/study/[documentId]">): Promise<Metadata> {
  const playerId = await requirePlayer();
  const doc = await getPlayerDocument(playerId, (await props.params).documentId);
  return { title: doc ? `${doc.filename} · Study · SYLLABYSS` : "Study · SYLLABYSS" };
}

/**
 * A file's study page (#75): every page of a Source Document as tidy study notes, one after the
 * other, with a contents list and the Games built from it. `?page=N` scrolls to page N. Notes a
 * page doesn't have yet are written on the client as it scrolls into view.
 */
export default async function StudyPage(props: PageProps<"/modules/[moduleId]/study/[documentId]">) {
  const playerId = await requirePlayer();
  const { moduleId, documentId } = await props.params;
  const [mod, doc] = await Promise.all([getModule(playerId, moduleId), getPlayerDocument(playerId, documentId)]);
  if (!mod || !doc) notFound();
  if (doc.module_id !== mod.id) redirect(`/modules/${doc.module_id}/study/${doc.id}`);
  if (doc.status !== "parsed") redirect(`/modules/${mod.id}`);

  const [pages, games, search] = await Promise.all([
    sql<{ pageNumber: number; contentMd: string; notesMd: string | null }[]>`
      select page_number as "pageNumber", content_md as "contentMd", notes_md as "notesMd"
      from source_pages where source_document_id = ${doc.id}
      order by page_index`,
    listModuleGames(playerId, mod.id),
    props.searchParams,
  ]);
  const page = Number(typeof search.page === "string" ? search.page : 1);

  return (
    <StudyNotes
      module={{ id: mod.id, name: mod.name }}
      document={{ id: doc.id, filename: doc.filename }}
      pages={[...pages]}
      games={games
        .filter((g) => g.status === "ready" && g.sources.some((s) => s.id === doc.id))
        .map((g) => ({ id: g.id, title: g.title, mode: g.mode }))}
      initialPage={Number.isInteger(page) && page > 0 ? page : 1}
    />
  );
}
