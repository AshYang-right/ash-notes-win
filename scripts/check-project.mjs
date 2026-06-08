import { spawnSync } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const npmBin = isWindows ? "npm.cmd" : "npm";

function run(label, command, args, options = {}) {
  console.log("");
  console.log(`> ${label}`);
  let result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (isWindows && result.error && command.endsWith(".cmd")) {
    result = spawnSync([command, ...args].join(" "), {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true,
      ...options,
    });
  }

  if (result.error || result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("Environment doctor", npmBin, ["run", "doctor"]);
run("Agent context check", npmBin, ["run", "agent:check"]);
run("Frontend build", npmBin, ["run", "build"]);
run("Rust check", "cargo", ["check"], { cwd: "src-tauri" });

console.log("");
console.log("Project check passed.");
