// Starts Next.js with the repo root .env loaded into the environment first,
// so the proxy, server code and worker processes all see the same values.
// Usage: node scripts/next.mjs dev|build|start
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, "..", "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
// A gitignored root .env.local overrides .env on this machine only (for example, no password locally).
const localFile = path.resolve(here, "..", "..", ".env.local");
if (fs.existsSync(localFile)) Object.assign(process.env, parseEnv(fs.readFileSync(localFile, "utf8")));

const bin = path.resolve(here, "..", "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
