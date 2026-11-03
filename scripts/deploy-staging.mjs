import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const vercelConfig = join(root, "vercel.json");
const stagingConfig = join(root, "vercel.staging.json");
const scope = process.env.VERCEL_SCOPE ?? "asta-2e53";

if (!/^[a-z0-9_-]+$/i.test(scope)) {
  console.error("VERCEL_SCOPE must be a Vercel team slug.");
  process.exit(1);
}

const original = readFileSync(vercelConfig);
const staging = JSON.parse(readFileSync(stagingConfig, "utf8"));

if (!Array.isArray(staging.crons) || staging.crons.length > 0) {
  console.error(
    "vercel.staging.json must set \"crons\": [] for the Hobby staging deploy.",
  );
  process.exit(1);
}

console.log(
  "Deploying with vercel.staging.json (crons disabled). vercel.json will be restored afterwards.",
);

let status = 1;

try {
  writeFileSync(vercelConfig, readFileSync(stagingConfig));

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    npx,
    [
      "vercel",
      "deploy",
      "--prod",
      "--scope",
      scope,
      "--yes",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );

  if (result.error) {
    console.error(result.error.message);
  }

  status = result.status ?? 1;
} finally {
  writeFileSync(vercelConfig, original);
  console.log("vercel.json restored.");
}

process.exit(status);
