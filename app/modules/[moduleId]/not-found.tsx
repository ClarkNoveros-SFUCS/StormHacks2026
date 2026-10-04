import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";

export default function ModuleNotFound() {
  return (
    <section className="card mx-auto mt-6 flex max-w-lg flex-col items-center gap-5 px-6 py-12 text-center">
      <Mascot size={110} mood="sad" say="Nothing down here…" />
      <h1 className="text-2xl text-text">Module not found</h1>
      <p className="text-muted">It may have been deleted, or it belongs to someone else.</p>
      <Button href="/modules" variant="primary">
        Back to My Modules
      </Button>
    </section>
  );
}
