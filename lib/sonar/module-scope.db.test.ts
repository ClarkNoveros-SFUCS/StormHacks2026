// Integration tests for Sonar staying on the Player's own Module (#83). Run with `npm run test:db`.
// Everything happens in a rolled-back transaction.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { customModuleFor } from "./module-scope";
import { checkPlayable, checkReading } from "./playable";

type Tx = postgres.TransactionSql;
class Rollback extends Error {}

type F = { tx: Tx; me: string; module: string; courseModule: string; doc: string; game: string; otherGame: string; courseGame: string; run: string; courseRun: string };

async function withFixture(fn: (f: F) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      const me = `test_sonar83_${randomUUID()}`;
      await tx`insert into players (id) values (${me})`;
      const [{ id: module }] = await tx`insert into modules (player_id, name) values (${me}, 'CMPT 354') returning id`;
      const [{ id: other }] = await tx`insert into modules (player_id, name) values (${me}, 'Other') returning id`;
      const [{ id: courseModule }] = await tx`insert into modules (player_id, name) values (${me}, 'Course') returning id`;
      await tx`insert into courses (id, slug, title, level, summary, description, module_id)
               values (${randomUUID()}, ${`test-${randomUUID().slice(0, 8)}`}, 'C', 'Beginner', 's', 'd', ${courseModule})`;
      const [{ id: doc }] = await tx`
        insert into source_documents (module_id, player_id, filename, mime_type, size_bytes, status)
        values (${module}, ${me}, '01-354-SQLBasics.pdf', 'application/pdf', 1, 'parsed') returning id`;
      await tx`insert into source_pages (source_document_id, page_index, page_number, content_md)
               values (${doc}, 88, 89, '# Subqueries')`;
      const [game, otherGame, courseGame, run, courseRun] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await tx`insert into games (id, module_id, player_id, title, status) values
        (${game}, ${module}, ${me}, 'SQL', 'ready'), (${otherGame}, ${other}, ${me}, 'Elsewhere', 'ready'),
        (${courseGame}, ${courseModule}, ${me}, 'Hello World', 'ready')`;
      await tx`insert into runs (id, player_id, game_id, status) values
        (${run}, ${me}, ${game}, 'in_progress'), (${courseRun}, ${me}, ${courseGame}, 'in_progress')`;
      await fn({ tx, me, module, courseModule, doc, game, otherGame, courseGame, run, courseRun });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

describe("customModuleFor", () => {
  it("finds the Player's Module from a Module, Reveal or Game page, but not a Course's", () =>
    withFixture(async (f) => {
      const want = { moduleId: f.module, name: "CMPT 354" };
      expect(await customModuleFor(f.me, { kind: "module", path: "/m", moduleId: f.module }, f.tx)).toEqual(want);
      expect(await customModuleFor(f.me, { kind: "reveal", path: "/r", runId: f.run }, f.tx)).toEqual(want);
      expect(await customModuleFor(f.me, { kind: "game", path: "/g", gameId: f.game }, f.tx)).toEqual(want);
      expect(await customModuleFor(f.me, { kind: "reveal", path: "/r", runId: f.courseRun }, f.tx)).toBeNull();
      expect(await customModuleFor(f.me, { kind: "module", path: "/m", moduleId: f.courseModule }, f.tx)).toBeNull();
      expect(await customModuleFor("someone_else", { kind: "module", path: "/m", moduleId: f.module }, f.tx)).toBeNull();
    }));
});

describe("Module-scoped checks", () => {
  it("only recommends this Module's Games", () =>
    withFixture(async (f) => {
      expect((await checkPlayable(f.me, f.game, f.module, f.tx)).ok).toBe(true);
      expect(await checkPlayable(f.me, f.otherGame, f.module, f.tx)).toEqual({ ok: false, reason: "That Game isn't in this Module" });
      expect((await checkPlayable(f.me, f.otherGame, undefined, f.tx)).ok).toBe(true);
    }));
  it("only suggests real pages of this Module's Ready files", () =>
    withFixture(async (f) => {
      expect(await checkReading(f.me, f.module, f.doc, 89, f.tx)).toEqual({ ok: true, filename: "01-354-SQLBasics.pdf" });
      expect(await checkReading(f.me, f.module, f.doc, 90, f.tx)).toMatchObject({ ok: false, reason: expect.stringContaining("no page 90") });
      expect(await checkReading(f.me, f.courseModule, f.doc, 89, f.tx)).toMatchObject({ ok: false });
      expect(await checkReading(f.me, f.module, "nope", 89, f.tx)).toMatchObject({ ok: false });
    }));
});
