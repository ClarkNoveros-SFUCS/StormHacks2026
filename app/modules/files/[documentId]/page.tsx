import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { studyHref } from "../../_lib/files";
import { documentModule } from "../../_lib/queries";

/**
 * Deep link that only needs the file: `/modules/files/<documentId>?page=<n>` opens the file's
 * study page at that page.
 */
export default async function FileLink(props: PageProps<"/modules/files/[documentId]">) {
  const playerId = await requirePlayer();
  const { documentId } = await props.params;
  const moduleId = await documentModule(playerId, documentId);
  if (!moduleId) notFound();
  const page = Number((await props.searchParams).page);
  redirect(studyHref(moduleId, documentId, Number.isInteger(page) ? page : 1));
}
