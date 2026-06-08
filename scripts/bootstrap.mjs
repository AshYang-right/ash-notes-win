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

run("Check basic local development prerequisites", "node", [
  "scripts/doctor.mjs",
  "--allow-missing-rust",
]);
run("Install JavaScript dependencies", npmBin, ["install"]);
run("Verify agent context", npmBin, ["run", "agent:check"]);
run("Check full local development prerequisites", "node", ["scripts/doctor.mjs"]);

console.log("");
console.log("Setup complete. Start the app with:");
console.log(isWindows ? "  npm.cmd run app:dev" : "  npm run app:dev");
