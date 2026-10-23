import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// SUPABASE_HOME and optional SUPABASE_DB_PASSWORD are inherited, never logged.
const result = spawnSync(
  process.env.SUPABASE_CLI || "supabase",
  ["db", "query", "--linked", "--file", fileURLToPath(new URL("./maintenance-health.sql", import.meta.url)), "--output", "json"],
  { encoding: "utf8", maxBuffer: 2 ** 20 },
);
if (result.error || result.status !== 0) {
  console.error("Maintenance health query failed. Check the CLI login and database connection.");
  process.exitCode = 2;
} else {
  try {
    const health = JSON.parse(result.stdout)[0]?.health;
    if (!health || typeof health.cron_active !== "boolean") throw new Error("Invalid health response");
    console.log(JSON.stringify(health, null, 2));
    if (health.alert_no_recent_success || health.alert_latest_failure || !health.cron_active) process.exitCode = 1;
  } catch {
    console.error("Maintenance health query returned an unexpected response.");
    process.exitCode = 2;
  }
}
