import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(projectDirectory, "../../..");
const [command = "dev", ...args] = process.argv.slice(2);

loadEnvConfig(repositoryRoot, command === "dev");

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextCli, command, ...args], {
  cwd: projectDirectory,
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("Could not start the prototype:", error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
