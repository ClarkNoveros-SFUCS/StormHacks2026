import "server-only";
import graph from "@/db/seed/courses/python-basics.sonar.json";
import { lockedTopics } from "@/lib/courses/rules";
import { sql } from "@/lib/db";
import type { ModeId, PromptKind } from "@/lib/modes";
import type { Db } from "@/lib/progress";
import { diagnose } from "./diagnose";
import type { Edge } from "./graph";
import { replay, type Observation } from "./model";
import { planActions, type PlanTopic } from "./plan";
import { conceptsForPrompt } from "./tags";
import type { Concept, SonarModel } from "./types";

// Sonar (F32): the Player's learner model for Python Basics, computed on read. Two queries in
// parallel: the Course's Topics (Games, Pass and lock state) and every observation, then a
// replay through lib/sonar/model.ts. Spec: docs/architecture/sonar.md § Learner model.
//
// Observations: every guess_events row on a Game of the Course's Module (retired Games too),
// plus run_prompts timeouts, which guess_events doesn't log. Timeouts count only in Dive,
// Apogee, Leap and Arena (a per-Prompt clock) and only when the Prompt got no guess (a wrong
// guess already counted the miss). Blitz and Pairs "timeouts" are what was left when the Run's
// clock ran out, not evidence. guess_events.hint_used is the 50/50 in Leap, the Hint in Dive.

const COURSE = "python-basics";

const CONCEPTS: Concept[] = graph.concepts.map((c) => ({ id: c.id, name: c.name, topicSlug: c.topic, summary: c.summary, pages: c.pages }));
const EDGES = graph.edges as [string, string][];

type TopicRow = { slug: string; position: number; title: string; passed: boolean; games: PlanTopic["games"] };
type ObsRow = { at: Date; correct: boolean; hint_used: boolean; text: string; kind: PromptKind; mode: ModeId; topic: string | null };

export async function loadSonarModel(playerId: string, db: Db = sql): Promise<SonarModel> {
  const [topicRows, obsRows] = await Promise.all([
    db<TopicRow[]>`
      select t.slug, t.position, t.title, tp.passed_at is not null as passed,
             coalesce((select json_agg(json_build_object('gameId', g.id, 'mode', tg.mode, 'title', g.title))
                         from topic_games tg join games g on g.id = tg.game_id
                        where tg.topic_id = t.id and g.status = 'ready' and g.visibility = 'public'), '[]') as games
        from course_topics t
        join courses c on c.id = t.course_id and c.slug = ${COURSE}
        left join topic_progress tp on tp.topic_id = t.id and tp.player_id = ${playerId}
       order by t.position`,
    db<ObsRow[]>`
      with c as (select id, module_id from courses where slug = ${COURSE}),
      gt as (  -- each Game of the Module → its Topic (retired Games: via the reading they were made from)
        select g.id, g.mode,
               coalesce((select t.slug from topic_games tg join course_topics t on t.id = tg.topic_id where tg.game_id = g.id),
                        (select t.slug from game_sources gs join course_topics t on t.source_document_id = gs.source_document_id
                          where gs.game_id = g.id and t.course_id = c.id limit 1)) as topic
          from games g join c on g.module_id = c.module_id
      )
      select e.created_at as at, e.is_correct as correct, e.hint_used, p.text, p.kind, gt.mode, gt.topic
        from guess_events e
        join gt on gt.id = e.game_id
        join prompts p on p.id = e.prompt_id
       where e.player_id = ${playerId}
      union all
      select coalesce(rp.ended_at, rp.deadline_at, r.started_at), false, rp.hint_used, p.text, p.kind, gt.mode, gt.topic
        from runs r
        join gt on gt.id = r.game_id
        join run_prompts rp on rp.run_id = r.id
        join prompts p on p.id = rp.prompt_id
       where r.player_id = ${playerId} and rp.outcome = 'timeout' and gt.mode in ('dive', 'apogee', 'leap', 'arena')
         and not exists (select 1 from guess_events e
                          where e.player_id = ${playerId} and e.run_id = r.id and e.position = rp.position)
       order by 1`,
  ]);

  const observations: Observation[] = obsRows.map((r) => {
    const tagged = conceptsForPrompt(r.text);
    return {
      at: r.at,
      concepts: tagged.length ? tagged : conceptsForPrompt(r.text, r.topic),
      fallback: tagged.length === 0,
      correct: r.correct,
      mode: r.mode,
      kind: r.kind,
      hintUsed: r.hint_used,
    };
  });

  const now = new Date();
  const { concepts, misses, modesSeen } = replay(CONCEPTS, observations, now);
  const locked = lockedTopics(topicRows.map((t) => t.passed));
  const planTopics: PlanTopic[] = topicRows.map((t, i) => ({
    slug: t.slug, number: t.position, title: t.title, coursePassed: t.passed, locked: locked[i], games: t.games,
  }));
  const rootCause = diagnose(concepts, misses, EDGES);
  const actions = planActions({ concepts, edges: EDGES as Edge[], topics: planTopics, rootCause, observations: observations.length, modesSeen });

  const topics = planTopics.map((t) => {
    const seen = concepts.filter((c) => c.topicSlug === t.slug && c.n > 0);
    return {
      slug: t.slug,
      number: t.number,
      title: t.title,
      coursePassed: t.coursePassed,
      sonarMastery: seen.length ? seen.reduce((s, c) => s + c.pEff, 0) / seen.length : 0,
    };
  });

  return { courseSlug: COURSE, concepts, edges: EDGES, topics, rootCause, actions, observations: observations.length };
}
