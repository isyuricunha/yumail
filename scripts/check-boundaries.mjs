import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const disallowedTauriPackageDirs = [
  "packages/core",
  "packages/mail",
  "packages/ai",
  "packages/db",
  "packages/renderer",
  "packages/search",
  "packages/shared"
];

const reactSourceDirs = ["apps/desktop/src", "packages/ui/src"];

const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".rs"
]);

async function collectFiles(directory) {
  const absoluteDirectory = path.join(root, directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  );

  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") {
        continue;
      }

      files.push(...await collectFiles(relativePath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }

  return files;
}

async function checkTauriImports() {
  const violations = [];

  for (const directory of disallowedTauriPackageDirs) {
    for (const file of await collectFiles(directory)) {
      const contents = await readFile(path.join(root, file), "utf8");

      if (
        contents.includes("@tauri-apps/") ||
        contents.includes("from \"tauri\"") ||
        contents.includes("from 'tauri'") ||
        contents.includes("tauri::")
      ) {
        violations.push(`${file}: Tauri-specific import or symbol found`);
      }
    }
  }

  return violations;
}

async function checkReactInvokeUsage() {
  const violations = [];

  for (const directory of reactSourceDirs) {
    for (const file of await collectFiles(directory)) {
      const contents = await readFile(path.join(root, file), "utf8");

      if (
        contents.includes("@tauri-apps/api/core") ||
        /\binvoke\s*\(/u.test(contents)
      ) {
        violations.push(`${file}: React source must not call Tauri invoke directly`);
      }
    }
  }

  return violations;
}

const violations = [
  ...await checkTauriImports(),
  ...await checkReactInvokeUsage()
];

if (violations.length > 0) {
  console.error("Architecture boundary violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Architecture boundaries verified.");
