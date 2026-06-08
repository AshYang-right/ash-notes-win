import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function requireFile(path) {
  if (!existsSync(join(root, path))) {
    errors.push(`Missing required file: ${path}`);
  }
}

function walkFiles(dir) {
  const absoluteDir = join(root, dir);
  if (!existsSync(absoluteDir)) return [];

  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = join(absoluteDir, entry);
    const repoPath = relative(root, absolutePath).replaceAll("\\", "/");

    if (statSync(absolutePath).isDirectory()) {
      return walkFiles(repoPath);
    }

    return repoPath;
  });
}

function requireMention(indexText, path, indexPath) {
  if (!indexText.includes(path)) {
    errors.push(`${indexPath} does not mention ${path}`);
  }
}

const requiredFiles = [
  "AGENTS.md",
  ".agents/INDEX.md",
  ".agents/rules/engineering.md",
  ".agents/rules/onboarding.md",
  ".agents/rules/prompt-engineering-maintenance.md",
  ".agents/skills/ashnotes-vibecoding/SKILL.md",
  ".agents/skills/zero-friction-onboarding/SKILL.md",
  ".agents/templates/dev-log.md",
  ".agents/templates/decision.md",
  ".agents/templates/skill.md",
  "docs/INDEX.md",
  "docs/onboarding.md",
  "docs/dev-log/2026-06-08-first-version-plan.md",
  "docs/dev-log/2026-06-08-ai-context-maintenance.md",
  "docs/dev-log/2026-06-08-zero-friction-onboarding.md",
  "docs/decisions/0001-ai-context-maintenance.md",
  "docs/decisions/0002-zero-friction-onboarding.md",
  ".github/pull_request_template.md",
  "scripts/bootstrap.mjs",
  "scripts/doctor.mjs",
  "scripts/check-project.mjs",
];

requiredFiles.forEach(requireFile);

if (errors.length === 0) {
  const agentIndex = readText(".agents/INDEX.md");
  const docsIndex = readText("docs/INDEX.md");
  const readme = readText("README.md");

  for (const file of walkFiles(".agents/rules").filter((path) =>
    path.endsWith(".md"),
  )) {
    requireMention(agentIndex, file.replace(".agents/", ""), ".agents/INDEX.md");
  }

  for (const file of walkFiles(".agents/skills").filter((path) =>
    path.endsWith("/SKILL.md"),
  )) {
    requireMention(agentIndex, file.replace(".agents/", ""), ".agents/INDEX.md");
  }

  for (const file of walkFiles(".agents/templates").filter((path) =>
    path.endsWith(".md"),
  )) {
    requireMention(agentIndex, file.replace(".agents/", ""), ".agents/INDEX.md");
  }

  for (const file of walkFiles("docs/decisions").filter((path) =>
    path.endsWith(".md"),
  )) {
    requireMention(docsIndex, file.replace("docs/", ""), "docs/INDEX.md");
  }

  for (const file of walkFiles("docs/dev-log").filter((path) =>
    path.endsWith(".md"),
  )) {
    const name = file.split("/").at(-1);
    if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name)) {
      errors.push(`Dev log file must start with YYYY-MM-DD: ${file}`);
    }
    requireMention(docsIndex, file.replace("docs/", ""), "docs/INDEX.md");
  }

  requireMention(readme, "AGENTS.md", "README.md");
  requireMention(readme, ".agents/INDEX.md", "README.md");
  requireMention(readme, "docs/INDEX.md", "README.md");
  requireMention(readme, "docs/onboarding.md", "README.md");
}

if (errors.length > 0) {
  console.error("Agent context check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Agent context check passed.");
