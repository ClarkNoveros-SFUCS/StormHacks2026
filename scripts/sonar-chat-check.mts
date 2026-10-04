// Sonar (F32) smoke test: one briefing and one chat turn through POST /api/sonar/chat, printing
// the reply, the actions and the latency. The route needs a signed-in Player, so run the dev
// server as one: DEV_PLAYER_ID=<player id> npx next dev, then
//   node scripts/sonar-chat-check.mts [path] [message] [base URL]
// e.g. node scripts/sonar-chat-check.mts /explore/python-basics/loops "why do I miss loops?"

const [path = "/sonar", message = "Why do I keep missing loop questions?", base = "http://localhost:3000"] = process.argv.slice(2);

async function turn(label: string, body: object) {
  const t = performance.now();
  const res = await fetch(`${base}/api/sonar/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - t);
  const json = await res.json();
  console.log(`\n=== ${label}: HTTP ${res.status} in ${ms} ms ===`);
  if (!res.ok) return console.log(json);
  console.log(json.reply);
  for (const a of json.actions) console.log(`  [${a.kind}/${a.source}${a.rank != null ? ` rank ${a.rank}` : ""}] ${a.title}: ${a.why}`);
}

await turn("briefing", { context: { path } });
await turn("chat", { message, context: { path } });
