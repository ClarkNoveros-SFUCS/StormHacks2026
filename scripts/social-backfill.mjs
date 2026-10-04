#!/usr/bin/env node
// F21: awards XP (and First Dive / Level Badges) for Runs that finished without going through
// onRunFinished, e.g. before the social migration or before a Mode called the hook. Then
// refreshes the heatmap and weekly-XP continuous aggregates so past days show up.
// Usage: npm run social:backfill
//
// Idempotent: a Run that already has its run_finished XP event is skipped, and Badges a
// Player already has are left alone. Same formula as xpForRun in lib/social/rules.ts.

import path from 'node:path';
import postgres from 'postgres';

const root = path.resolve(import.meta.dirname, '..');
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(root, file));
  } catch {}
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Put it in .env.local (see .env.example).');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const LEVEL_5_XP = 1000; //  50·(n−1)·n
const LEVEL_10_XP = 4500;

try {
  const awarded = await sql.begin(async (tx) => {
    const xp = await tx`
      insert into xp_events (at, player_id, amount, reason, ref)
      select r.finished_at, r.player_id, greatest(5, least(200, floor(r.score / 5.0)::int)), 'run_finished', r.id::text
      from runs r
      where r.status = 'finished' and r.finished_at is not null
        and not exists (select 1 from xp_events x
                        where x.player_id = r.player_id and x.reason = 'run_finished' and x.ref = r.id::text)
      returning player_id`;
    const firstDive = await tx`
      insert into player_badges (player_id, badge_id, earned_at, ref)
      select distinct on (r.player_id) r.player_id, 'first-dive', r.finished_at, r.id::text
      from runs r
      where r.status = 'finished' and r.finished_at is not null
      order by r.player_id, r.finished_at
      on conflict do nothing
      returning player_id`;
    const levels = await tx`
      insert into player_badges (player_id, badge_id)
      select t.player_id, b.badge_id
      from (select player_id, sum(amount) as xp from xp_events group by player_id) t
      join players p on p.id = t.player_id
      cross join (values ('level-5', ${LEVEL_5_XP}::int), ('level-10', ${LEVEL_10_XP}::int)) b(badge_id, min_xp)
      where t.xp >= b.min_xp
      on conflict do nothing
      returning player_id`;
    return { runs: xp.length, players: new Set(xp.map((r) => r.player_id)).size, badges: firstDive.length + levels.length };
  });
  console.log(`XP for ${awarded.runs} Run(s) across ${awarded.players} Player(s); ${awarded.badges} Badge(s).`);

  // Outside the transaction (a refresh can't run inside one). End a minute ago, like the
  // policies: a NULL end would materialize today and hide later activity until tomorrow.
  for (const view of ['player_activity_daily', 'player_xp_weekly']) {
    await sql`call refresh_continuous_aggregate(${view}::regclass, null, now() - interval '1 minute')`;
  }
  console.log('Refreshed player_activity_daily and player_xp_weekly.');
} catch (err) {
  console.error('Backfill failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
