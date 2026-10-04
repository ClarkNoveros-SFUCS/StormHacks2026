import { Button, Mascot, SkyBackdrop } from "@/components/ui";

type Props = {
  gameId: string;
  gameTitle: string;
  /** Headline, e.g. "This dive was abandoned". */
  title?: string;
  body?: string;
};

/**
 * A site-styled stop screen for /runs/**: an abandoned Run (you started another one), or a
 * Mode whose screen isn't built yet (ModeComingSoon wraps it).
 */
export function RunClosed({
  gameId,
  gameTitle,
  title = "This run was abandoned",
  body = "You started a newer run of this Game, so this one stopped where it was. Its correct answers still count toward Mastery.",
}: Props) {
  return (
    <main className="relative flex min-h-[80vh] flex-1 items-center justify-center px-4 py-16">
      <SkyBackdrop variant="night" />
      <div className="card flex w-full max-w-md flex-col items-center gap-4 p-8 text-center" style={{ animation: "rise-in .5s var(--ease-out) both" }}>
        <Mascot size={88} mood="sleep" followCursor={false} />
        <h1 className="font-display text-2xl text-text">{title}</h1>
        <p className="text-muted">{body}</p>
        <p className="text-sm text-faint">{gameTitle}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button href={`/runs/new?game=${gameId}`} variant="primary">
            Play again
          </Button>
          <Button href={`/games/${gameId}`} variant="ghost">
            Back to Game
          </Button>
        </div>
      </div>
    </main>
  );
}
