import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { documentModule } from "../../_lib/queries";

/**
 * Evidence deep link that only needs the file: `/modules/files/<documentId>?page=<n>` opens the
 * file viewer on that page, on the file's Module page.
 */
export default async function FileLink(props: PageProps<"/modules/files/[documentId]">) {
  const playerId = await requirePlayer();
  const { documentId } = await props.params;
  const moduleId = await documentModule(playerId, documentId);
  if (!moduleId) notFound();
  const page = Number((await props.searchParams).page);
  const q = new URLSearchParams({ doc: documentId });
  if (Number.isInteger(page) && page > 0) q.set("page", String(page));
  redirect(`/modules/${moduleId}?${q}`);
}
