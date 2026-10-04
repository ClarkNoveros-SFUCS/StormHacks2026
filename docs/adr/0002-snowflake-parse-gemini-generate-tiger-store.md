# Snowflake parses, Gemini generates, Tiger Data stores

Three services each do one job. **Snowflake** holds uploaded files in an internal stage and turns them into per-page markdown with `AI_PARSE_DOCUMENT` (layout mode, page split), once per file. **Gemini** turns stored pages into Prompts/Answers/Hints, once per Game. **Tiger Data** (Postgres + TimescaleDB) holds all app data, plus every guess as a hypertable event. Nothing calls Snowflake or Gemini during a Run, so play depends only on the database.

We chose this split to use both MLH partner tracks (Snowflake, Tiger Data) for something each is genuinely good at. Snowflake's parser gives us page numbers for Evidence for free; Tiger's hypertables suit an append-only guess log and its continuous aggregates. Gemini was the team's choice of generator.

## Considered options

- **Cortex `AI_COMPLETE` for generation** (keeping all AI inside Snowflake): rejected. Gemini called from Next.js gives direct control over the prompt and the structured JSON output.
- **The old in-house PDF pipeline**: dropped entirely.
- **Storing app data in Snowflake**: rejected. Snowflake is a warehouse; per-guess transactional reads and writes belong in Postgres.

## Consequences

The server needs credentials for three services (see `docs/architecture/overview.md`). Parsed pages are copied into Postgres so generation and the Reveal screen never touch Snowflake.
