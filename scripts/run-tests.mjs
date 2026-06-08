import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packageNames = ["mail", "core", "db", "renderer"];
const testFiles = [];

for (const packageName of packageNames) {
  const testDirectory = path.join(root, "packages", packageName, "test");
  const entries = await readdir(testDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      testFiles.push(path.join(testDirectory, entry.name));
    }
  }
}

testFiles.sort();

if (testFiles.length === 0) {
  throw new Error("No package test files were found.");
}

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
