import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = path.join(root, ".local", "web-tests", randomUUID());
mkdirSync(temp, { recursive: true });
const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/vitest/vitest.mjs"), "run"],
  {
    cwd: path.join(root, "web"),
    stdio: "inherit",
    env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
