// Separate instance, same synthetic scope. Never imports an email provider.
import { reserveWarmup } from "../orsaWarmup";
import { pool } from "../db";

const scope = process.argv[2];
if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production" ||
    process.env.ORSA_WARMUP_DB_TEST !== "1" || !/^test-[a-f0-9-]{24}$/.test(scope || "")) {
  throw new Error("Only explicitly enabled synthetic development scopes are permitted.");
}
async function main() {
  try {
    console.log(JSON.stringify(await reserveWarmup("synthetic-instance", "synthetic-admin", scope)));
  } finally {
    await pool.end();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
