"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AskSonarButton } from "@/components/sonar/AskSonarButton";
import { Button } from "@/components/ui/Button";
import { Mascot, type MascotHandle } from "@/components/ui/Mascot";
import { Modal } from "@/components/ui/Modal";
import { Odometer } from "@/components/ui/Odometer";
import { useToast } from "@/components/ui/Toast";
import { validateUpload } from "@/lib/documents/parsed-pages";
import type { GameSummary } from "@/lib/games/types";
import { MODES } from "@/lib/modes";
import { burstFrom } from "@/lib/motion/particles";
import { sfx } from "@/lib/ui/sfx";
import { api, uploadFile, usePolling } from "../_lib/client";
import { studyHref } from "../_lib/files";
import type { CardProgress, DocRow, GameRow, UploadItem } from "../_lib/types";
import { FilesPanel } from "./FilesPanel";
import { GamesPanel, isGenerating } from "./GamesPanel";
import { moduleTint } from "./ModuleBanner";
import { NewGameDialog, type NewGameInput } from "./NewGameDialog";
import { SONAR_GAME_CREATED_EVENT, type SonarGameCreatedDetail } from "@/lib/sonar/client";
import { Portal } from "./Portal";

type Props = {
  module: { id: string; name: string };
  initialDocuments: DocRow[];
  initialGames: GameRow[];
  progress: Record<string, CardProgress>;
  /** The URL asked for a file (`?doc=`) that isn't in this Module. */
  missingDoc: boolean;
  /** The page map (#90), rendered on the server; shown under the header. */
  map?: ReactNode;
};

type Confirm = { kind: "doc"; doc: DocRow } | { kind: "game"; game: GameRow } | null;

/** The on-screen match (Next keeps recently visited pages mounted but hidden). */
const visibleEl = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find((e) => e.offsetParent !== null) ?? null;

const toRow = (g: GameSummary | GameRow): GameRow => ({
  ...g,
  created_at: new Date(g.created_at).toISOString(),
});

export function ModuleWorkspace({ module: mod, initialDocuments, initialGames, progress, missingDoc, map }: Props) {
  const [docs, setDocs] = useState(initialDocuments);
  const [games, setGames] = useState(initialGames);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const router = useRouter();
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const deleted = useRef(new Set<string>());
  const mascot = useRef<MascotHandle>(null);
  const toast = useToast();
  const tint = moduleTint(mod.id);

  // A deep link to a file that isn't in this Module: say so once and clean the URL.
  useEffect(() => {
    if (missingDoc) {
      toast({ title: "That file isn't in this Module", tone: "danger" });
      window.history.replaceState(window.history.state, "", `/modules/${mod.id}`);
    }
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markFresh = useCallback((id: string) => {
    setFreshIds((s) => new Set(s).add(id));
    setTimeout(
      () =>
        setFreshIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        }),
      1200,
    );
  }, []);

  const usedBy = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of games) for (const src of g.sources) map.set(src.id, [...(map.get(src.id) ?? []), g.title]);
    return map;
  }, [games]);
  const readyDocs = docs.filter((d) => d.status === "parsed");

  // A Game made from Sonar's card (F32): add it as Generating; the polling below takes it to Ready.
  useEffect(() => {
    const onCreated = (e: Event) => {
      const { game } = (e as CustomEvent<SonarGameCreatedDetail>).detail;
      if (game.module_id !== mod.id) return;
      setGames((gs) => (gs.some((g) => g.id === game.id) ? gs : [toRow(game), ...gs]));
      markFresh(game.id);
      mascot.current?.say(`Writing your ${MODES[game.mode].name} Game…`, 3000);
    };
    window.addEventListener(SONAR_GAME_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(SONAR_GAME_CREATED_EVENT, onCreated);
  }, [mod.id, markFresh]);

  // ---- Polling -------------------------------------------------------------------------------
  const docsBusy = docs.some((d) => d.status === "uploaded" || d.status === "parsing");
  usePolling(docsBusy, 1500, async () => {
    const { documents } = await api<{ documents: DocRow[] }>(`/api/modules/${mod.id}/documents`);
    const before = new Map(docs.map((d) => [d.id, d.status]));
    for (const d of documents) {
      const was = before.get(d.id);
      if (!was || was === d.status) continue;
      if (d.status === "parsed") {
        toast({
          title: `${d.filename} is ready`,
          body: `${d.page_count ?? 0} pages parsed. Click it to read them.`,
          tone: "reward",
          icon: "check",
        });
        mascot.current?.react("happy");
        markFresh(d.id);
        requestAnimationFrame(() =>
          burstFrom(visibleEl(`[data-doc="${d.id}"]`), {
            count: 18,
            kind: "spark",
          }),
        );
      } else if (d.status === "failed") {
        toast({
          title: `Couldn't read ${d.filename}`,
          body: d.error ?? undefined,
          tone: "danger",
        });
        mascot.current?.react("sad");
      }
    }
    setDocs(documents.filter((d) => !deleted.current.has(d.id)));
  });

  const gamesBusy = games.some(isGenerating);
  usePolling(gamesBusy, 3000, async () => {
    const { games: fresh } = await api<{ games: GameSummary[] }>(`/api/modules/${mod.id}/games`);
    const before = new Map(games.map((g) => [g.id, g.status]));
    for (const g of fresh) {
      const was = before.get(g.id);
      if (!was || was === g.status) continue;
      if (g.status === "ready") {
        toast({
          title: `${g.title} is ready to play`,
          body: `${g.prompt_count ?? 0} prompts from your notes.`,
          tone: "reward",
          icon: "star",
        });
        mascot.current?.react("wow");
        markFresh(g.id);
        requestAnimationFrame(() =>
          burstFrom(visibleEl(`[data-game="${g.id}"]`), {
            count: 40,
          }),
        );
      } else if (g.status === "failed") {
        toast({
          title: `${g.title} couldn't be made`,
          body: g.error ?? undefined,
          tone: "danger",
        });
        mascot.current?.react("sad");
      }
    }
    setGames(fresh.filter((g) => !deleted.current.has(g.id)).map(toRow));
  });

  // ---- Uploads ---------------------------------------------------------------------------------
  const onFiles = (files: File[]) => {
    for (const file of files) {
      try {
        validateUpload(file.name, file.type, file.size);
      } catch (e) {
        toast({
          title: `Can't upload ${file.name}`,
          body: (e as Error).message,
          tone: "danger",
        });
        continue;
      }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setUploads((u) => [{ key, filename: file.name, size: file.size, progress: 0 }, ...u]);
      sfx.whoosh();
      uploadFile<{ document: DocRow }>(`/api/modules/${mod.id}/documents`, file, (p) =>
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))),
      )
        .then(({ document }) => {
          setUploads((u) => u.filter((x) => x.key !== key));
          setDocs((d) => [document, ...d.filter((x) => x.id !== document.id)]);
          markFresh(document.id);
          sfx.pop();
        })
        .catch((e: Error) => {
          setUploads((u) => u.filter((x) => x.key !== key));
          toast({
            title: `Couldn't upload ${file.name}`,
            body: e.message,
            tone: "danger",
          });
        });
    }
  };

  // ---- Study page (#75) -------------------------------------------------------------------------
  const openDoc = (docId: string) => {
    const d = docs.find((x) => x.id === docId);
    if (!d) return;
    if (d.status !== "parsed") {
      toast({
        title: "Still reading that file",
        body: "It opens once it's Ready.",
      });
      return;
    }
    router.push(studyHref(mod.id, docId));
  };

  // ---- Deletes ---------------------------------------------------------------------------------
  const animateOut = (id: string, then: () => void) => {
    setRemoving((s) => new Set(s).add(id));
    setTimeout(() => {
      then();
      setRemoving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 340);
  };

  const confirmDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "doc") {
        const d = confirm.doc;
        await api(`/api/documents/${d.id}`, { method: "DELETE" });
        deleted.current.add(d.id);
        setConfirm(null);
        animateOut(d.id, () => setDocs((xs) => xs.filter((x) => x.id !== d.id)));
        toast({ title: `Deleted ${d.filename}`, tone: "info", icon: "cross" });
      } else {
        const g = confirm.game;
        await api(`/api/games/${g.id}`, { method: "DELETE" });
        deleted.current.add(g.id);
        setConfirm(null);
        animateOut(g.id, () => setGames((xs) => xs.filter((x) => x.id !== g.id)));
        toast({ title: `Deleted ${g.title}`, tone: "info", icon: "cross" });
      }
    } catch (e) {
      toast({
        title: "Couldn't delete that",
        body: (e as Error).message,
        tone: "danger",
      });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  // ---- New Game --------------------------------------------------------------------------------
  const createGame = async (input: NewGameInput) => {
    const { game } = await api<{ game: GameSummary }>(`/api/modules/${mod.id}/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    setNewGameOpen(false);
    setGames((gs) => [toRow(game), ...gs]);
    markFresh(game.id);
    sfx.reward();
    mascot.current?.say(`Writing your ${MODES[game.mode].name} Game…`, 3000);
    toast({
      title: `Making ${game.title}`,
      body: "About a minute. You can keep uploading meanwhile.",
      tone: "info",
      icon: "sparkle",
    });
    requestAnimationFrame(() =>
      burstFrom(visibleEl(`[data-game="${game.id}"]`), {
        count: 30,
        kind: "spark",
      }),
    );
  };

  const ready = readyDocs.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <nav aria-label="Breadcrumb" className="font-display text-[12px] tracking-[.2em] text-faint uppercase">
            <Link href="/modules" className="text-muted transition hover:text-signal">
              My Modules
            </Link>{" "}
            / <span className="text-faint">Module</span>
          </nav>
          <h1 className="text-[28px] leading-tight break-words text-text sm:text-[36px]">
            <span
              aria-hidden="true"
              className="mr-2 inline-block h-3 w-3 translate-y-[-4px] rounded-[2px]"
              style={{ background: tint, boxShadow: `0 0 12px ${tint}` }}
            />
            {mod.name}
          </h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              <Odometer value={docs.length} className="font-hud text-xl text-violet" /> files
            </span>
            <span>
              <Odometer value={ready} className="font-hud text-xl text-success" /> ready
            </span>
            <span>
              <Odometer value={games.length} className="font-hud text-xl text-reward" /> games
            </span>
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="hidden sm:block">
            <Mascot ref={mascot} size={72} bubbleSide="left" sleepAfterMs={40000} />
          </div>
          <AskSonarButton message="What am I getting wrong in this Module?" />
          <Button
            variant="primary"
            onClick={() => setNewGameOpen(true)}
            disabled={!ready}
            title={ready ? undefined : "Upload a file first"}
          >
            + New Game
          </Button>
        </div>
      </header>

      {map}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <FilesPanel
          docs={docs}
          uploads={uploads}
          usedBy={usedBy}
          removing={removing}
          freshIds={freshIds}
          onFiles={onFiles}
          onOpen={(d) => openDoc(d.id)}
          onDelete={(doc) => setConfirm({ kind: "doc", doc })}
        />
        <GamesPanel
          games={games}
          progress={progress}
          freshIds={freshIds}
          removing={removing}
          canCreate={ready > 0}
          onNewGame={() => setNewGameOpen(true)}
          onOpenDoc={(id) => openDoc(id)}
          onDelete={(game) => setConfirm({ kind: "game", game })}
        />
      </div>

      <Portal>
        <NewGameDialog
          open={newGameOpen}
          onClose={() => setNewGameOpen(false)}
          moduleName={mod.name}
          readyDocs={readyDocs}
          onCreate={createGame}
        />

        <Modal
          open={!!confirm}
          onClose={() => !busy && setConfirm(null)}
          title={
            confirm?.kind === "doc" ? `Delete ${confirm.doc.filename}?` : confirm ? `Delete ${confirm.game.title}?` : ""
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
                Keep it
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={busy}>
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          <p className="text-muted">
            {confirm?.kind === "doc"
              ? "Its parsed pages go with it. You can upload the file again any time."
              : "Its Runs, Personal Best and Mastery go with it. This can't be undone."}
          </p>
        </Modal>

      </Portal>
    </div>
  );
}
