import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// 1. Manually parse root .env to avoid external dependencies
function loadEnv() {
  let envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    envPath = path.resolve(process.cwd(), "../.env");
  }
  if (!fs.existsSync(envPath)) {
    console.error("Could not find .env file at either current or parent directory.");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// SQL Escaping Helper
function escapeSqlValue(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportTable(tableName: string, selectFields = "*"): Promise<string[]> {
  console.log(`Fetching data from table: ${tableName}...`);
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select(selectFields)
      .range(from, to);

    if (error) {
      console.error(`Error fetching table ${tableName} (page ${page}):`, error.message);
      return [];
    }

    if (!data || data.length === 0) {
      break;
    }

    allData = allData.concat(data);

    if (data.length < pageSize) {
      break;
    }

    page++;
  }

  if (allData.length === 0) {
    console.log(`Table ${tableName} is empty.`);
    return [];
  }

  const statements: string[] = [];
  const columns = Object.keys(allData[0]);

  for (const row of allData) {
    const vals = columns.map(col => escapeSqlValue(row[col]));
    statements.push(`INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${vals.join(", ")});`);
  }

  console.log(`Generated ${statements.length} inserts for ${tableName} (total: ${allData.length} records).`);
  return statements;
}

async function run() {
  const dumpFile = path.resolve(process.cwd(), "d1-data-dump.sql");
  console.log("Starting Supabase Postgres to Cloudflare D1 data sync...");
  
  const allStatements: string[] = [
    "-- Cephlow D1 Database Dump",
    "-- Generated on: " + new Date().toISOString(),
    "PRAGMA foreign_keys = OFF;",
    "DELETE FROM student_profile_certs;",
    "DELETE FROM student_profile_index;",
    "DELETE FROM student_profiles;",
    "DELETE FROM wa_messages;",
    "DELETE FROM certificates;",
    "DELETE FROM batches;",
    "DELETE FROM redemption_requests;",
    "DELETE FROM workspace_transfers;",
    "DELETE FROM payment_orders;",
    "DELETE FROM frame_likes;",
    "DELETE FROM frame_purchases;",
    "DELETE FROM frame_listings;",
    "DELETE FROM custom_frames;",
    "DELETE FROM workspace_brands;",
    "DELETE FROM workspace_invites;",
    "DELETE FROM workspace_members;",
    "DELETE FROM spreadsheets;",
    "DELETE FROM builtin_templates;",
    "DELETE FROM ledgers;",
    "DELETE FROM user_google_tokens;",
    "DELETE FROM pending_google_auth;",
    "DELETE FROM workspaces;",
    "DELETE FROM user_profiles;",
    ""
  ];

  try {
    // Export tables in dependency order
    const tableOrders = [
      "user_profiles",
      "workspaces",
      "pending_google_auth",
      "user_google_tokens",
      "ledgers",
      "spreadsheets",
      "builtin_templates",
      "workspace_members",
      "workspace_invites",
      "workspace_brands",
      "custom_frames",
      "frame_listings",
      "frame_purchases",
      "frame_likes",
      "payment_orders",
      "workspace_transfers",
      "redemption_requests",
      "batches",
      "certificates",
      "wa_messages",
      "student_profiles",
      "student_profile_index",
      "student_profile_certs",
    ];

    for (const table of tableOrders) {
      const inserts = await exportTable(table);
      if (inserts.length > 0) {
        allStatements.push(`-- Data for ${table}`);
        allStatements.push(...inserts);
        allStatements.push("");
      }
    }

    allStatements.push("PRAGMA foreign_keys = ON;");

    fs.writeFileSync(dumpFile, allStatements.join("\n"), "utf-8");
    console.log(`\nSuccess! D1 SQL data dump saved to: ${dumpFile}`);
    console.log("\nTo load this data into your local D1 emulator, run:");
    console.log("  npx wrangler d1 execute cephlow-app-db --local --file=./d1-data-dump.sql");
    console.log("\nTo load this data into production Cloudflare D1, run:");
    console.log("  npx wrangler d1 execute cephlow-app-db --remote --file=./d1-data-dump.sql");

  } catch (err: any) {
    console.error("Sync failed:", err.message);
    process.exit(1);
  }
}

run();
