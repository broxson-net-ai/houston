import { config } from "dotenv";
import { resolve } from "path";

// Load .env from repo root
config({ path: resolve(__dirname, "../../../.env") });

// Fallback for test environments
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://houston:houston@localhost:5434/houston";
}
