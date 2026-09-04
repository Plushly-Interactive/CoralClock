#!/usr/bin/env node
// dev — starts the project's dev command and tees ALL output to a log file the agent can grep.
// Usage: node scripts/os/dev.mjs [--stop]   (config: ./capture.config.mjs → start, logFile)
import { spawn, execSync } from "node:child_process";
import { mkdirSync, createWriteStream, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = (await import(pathToFileURL(path.join(here, "capture.config.mjs")).href)).default;
const root = path.resolve(here, "..", "..");
const logFile = path.resolve(root, cfg.logFile ?? "logs/dev.log");
const pidFile = path.join(here, ".dev.pid");

// Kill the WHOLE process tree: dev commands are wrapper chains (npm -> tauri -> vite/app);
// killing only the wrapper pid leaves the app and dev server running (harvested from Leitscape).
function killTree(pid) {
  if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  else {
    try { process.kill(-pid, "SIGTERM"); }  // negative pid = process group (needs detached spawn)
    catch { process.kill(pid, "SIGTERM"); } // fallback: plain kill
  }
}

if (process.argv.includes("--stop")) {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, "utf8"));
    try { killTree(pid); console.log(`dev: stopped tree at pid ${pid}`); } catch { console.log("dev: process already gone"); }
    try { unlinkSync(pidFile); } catch {} // parent's exit handler may have removed it already
  } else console.log("dev: not running (no pid file)");
  process.exit(0);
}

mkdirSync(path.dirname(logFile), { recursive: true });
const log = createWriteStream(logFile, { flags: "w" }); // fresh log per run
const child = spawn(cfg.start, {
  cwd: root, shell: true, env: { ...process.env, ...(cfg.env ?? {}) },
  detached: process.platform !== "win32", // own process group on POSIX so killTree(-pid) works
});
writeFileSync(pidFile, String(child.pid));
const tee = (stream) => stream.on("data", (d) => { log.write(d); process.stdout.write(d); });
tee(child.stdout); tee(child.stderr);
child.on("exit", (code) => { log.end(); try { unlinkSync(pidFile); } catch {} console.log(`dev: exited (${code}) — log: ${logFile}`); });
console.log(`dev: started pid ${child.pid} — logging to ${logFile}`);
