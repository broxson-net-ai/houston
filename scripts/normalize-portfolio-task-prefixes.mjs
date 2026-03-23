#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

async function main() {
  const c = new Client({ connectionString: dbUrl });
  await c.connect();

  const preview = await c.query(
    `select id, title,
            regexp_replace(title, '^V2(NOW|NEXT|LATER)\\s+', '\\1 ') as normalized
       from tasks
      where title ~ '^V2(NOW|NEXT|LATER)\\s+'
      order by "createdAt" desc
      limit 200`
  );

  if (!apply) {
    await c.end();
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          candidates: preview.rowCount || 0,
          sample: preview.rows.slice(0, 20),
          hint: "Re-run with --apply to rewrite prefixes",
        },
        null,
        2
      )
    );
    return;
  }

  const result = await c.query(
    `update tasks
        set title = regexp_replace(title, '^V2(NOW|NEXT|LATER)\\s+', '\\1 '),
            "updatedAt" = now()
      where title ~ '^V2(NOW|NEXT|LATER)\\s+'`
  );

  await c.end();
  console.log(JSON.stringify({ dryRun: false, updated: result.rowCount || 0 }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
