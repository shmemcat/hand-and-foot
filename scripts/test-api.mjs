import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "uv",
  ["run", "--locked", "--directory", "api", "python", "-m", "pytest"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      UV_CACHE_DIR: path.join(root, "api/.local/uv-cache"),
    },
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
