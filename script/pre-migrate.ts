import pg from "pg";

const OLD_TO_NEW_CATEGORY: Record<string, string> = {
  telecommunications: "miscellaneous",
  utilities: "real_estate",
  insurance: "financial",
  government: "protected_information",
  healthcare: "protected_information",
  other: "miscellaneous",
};

const VALID_CATEGORIES = [
  "financial",
  "memberships",
  "subscriptions",
  "real_estate",
  "protected_information",
  "miscellaneous",
];

async function preMigrate() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const tablesToFix = ["connected_accounts", "credit_pull_results", "service_providers"];

    for (const table of tablesToFix) {
      const colCheck = await client.query(
        `SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'category'`,
        [table]
      );
      if (colCheck.rows.length === 0) continue;

      const isTextType = colCheck.rows[0].data_type === "text" || colCheck.rows[0].udt_name === "text";

      if (isTextType) {
        for (const [oldVal, newVal] of Object.entries(OLD_TO_NEW_CATEGORY)) {
          const result = await client.query(
            `UPDATE "${table}" SET category = $1 WHERE category = $2`,
            [newVal, oldVal]
          );
          if (result.rowCount && result.rowCount > 0) {
            console.log(`[pre-migrate] ${table}: mapped '${oldVal}' -> '${newVal}' (${result.rowCount} rows)`);
          }
        }

        const remaining = await client.query(
          `SELECT DISTINCT category FROM "${table}" WHERE category NOT IN (${VALID_CATEGORIES.map((_, i) => `$${i + 1}`).join(",")})`,
          VALID_CATEGORIES
        );
        if (remaining.rows.length > 0) {
          const unknowns = remaining.rows.map((r: any) => r.category);
          console.log(`[pre-migrate] ${table}: mapping unknown categories to 'miscellaneous':`, unknowns);
          for (const unknown of unknowns) {
            await client.query(
              `UPDATE "${table}" SET category = 'miscellaneous' WHERE category = $1`,
              [unknown]
            );
          }
        }

        console.log(`[pre-migrate] ${table}: text column cleaned`);
      }
    }

    console.log("[pre-migrate] Category cleanup complete");
  } catch (error: any) {
    console.error("[pre-migrate] Error:", error.message);
  } finally {
    await client.end();
  }
}

preMigrate();
