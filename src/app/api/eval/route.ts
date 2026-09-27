import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { EVAL_REPORT_FILE } from "@/lib/config";
import { handle } from "@/lib/http";

export async function GET() {
  return handle(async () => (fs.existsSync(EVAL_REPORT_FILE) ? JSON.parse(fs.readFileSync(EVAL_REPORT_FILE, "utf8")) : { report: null }));
}

/** Runs the eval suite in a separate process against its own isolated GBrain brain (never the demo brain). */
export async function POST() {
  return handle(
    () =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", path.join(process.cwd(), "scripts", "eval.ts")], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (out += d));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0) return reject(new Error(`eval runner exited ${code}: ${out.slice(-600)}`));
          resolve(JSON.parse(fs.readFileSync(EVAL_REPORT_FILE, "utf8")));
        });
      }),
  );
}
