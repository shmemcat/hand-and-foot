import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [
  spawn(
    "uv",
    ["run", "--directory", "api", "python", "-m", "handandfoot_server"],
    {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        UV_CACHE_DIR: path.join(root, "api/.local/uv-cache"),
        HANDANDFOOT_DEVELOPMENT_FIXTURES: "1",
      },
    },
  ),
  spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js")], {
    cwd: path.join(root, "web"),
    stdio: "inherit",
    shell: false,
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
