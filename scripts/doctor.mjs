import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const isWindows = process.platform === "win32";
const npmBin = isWindows ? "npm.cmd" : "npm";
const allowMissingRust = process.argv.includes("--allow-missing-rust");
const failures = [];
const warnings = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    ...options,
  });

  if (isWindows && result.error && command.endsWith(".cmd")) {
    return spawnSync([command, ...args].join(" "), {
      cwd: root,
      encoding: "utf8",
      shell: true,
      ...options,
    });
  }

  return result;
}

function checkCommand(label, command, args, help, options = {}) {
  const result = run(command, args);

  if (result.error || result.status !== 0) {
    const message = `${label} missing. ${help}`;
    if (options.optional) {
      warnings.push(message);
      console.log(`[warn] ${label}`);
    } else {
      failures.push(message);
      console.log(`[missing] ${label}`);
    }
    return;
  }

  console.log(`[ok] ${label}: ${result.stdout.trim()}`);
}

function checkFile(path) {
  if (existsSync(join(root, path))) {
    console.log(`[ok] ${path}`);
    return;
  }

  failures.push(`Missing required file: ${path}`);
  console.log(`[missing] ${path}`);
}

console.log("AshNotes development environment doctor");
console.log("");

checkCommand("Node.js", "node", ["--version"], "Install Node.js LTS.");
checkCommand("npm", npmBin, ["--version"], "Install Node.js LTS, which includes npm.");
checkCommand("Rust compiler", "rustc", ["--version"], "Install Rust stable from https://rustup.rs/.", {
  optional: allowMissingRust,
});
checkCommand("Cargo", "cargo", ["--version"], "Install Rust stable from https://rustup.rs/.", {
  optional: allowMissingRust,
});

console.log("");
checkFile("package.json");
checkFile("package-lock.json");
checkFile("src-tauri/Cargo.toml");
checkFile("AGENTS.md");
checkFile(".agents/INDEX.md");
checkFile("docs/onboarding.md");

console.log("");
if (existsSync(join(root, "node_modules"))) {
  console.log("[ok] node_modules present");
} else {
  console.log("[info] node_modules not present; run npm.cmd run setup on Windows, or npm run setup elsewhere.");
}

if (failures.length > 0) {
  console.log("");
  console.error("Doctor found setup issues:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.log("");
  console.log("Doctor warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

console.log("");
console.log(warnings.length > 0 ? "Doctor passed with warnings." : "Doctor passed.");
console.log("You can run the desktop app with:");
console.log(isWindows ? "  npm.cmd run app:dev" : "  npm run app:dev");
