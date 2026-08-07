import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Render Blueprint wires web service, Postgres, secrets, and health check", async () => {
  const yaml = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
  for (const text of ["type: web", "runtime: node", "healthCheckPath: /health", "fromDatabase:", "generateValue: true", "CLIENT_ORIGIN", "databases:"]) assert.match(yaml, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("GitHub workflow builds Vite client and deploys Pages artifact", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  for (const text of ["actions/configure-pages@v5", "actions/upload-pages-artifact@v3", "actions/deploy-pages@v4", "VITE_API_URL", "client/dist"]) assert.ok(workflow.includes(text));
});

test("production build uses the GitHub project base path", async () => {
  const html = await readFile(new URL("../client/dist/index.html", import.meta.url), "utf8");
  assert.match(html, /\/iron-crown\/assets\//);
  assert.doesNotMatch(html, /chatgpt\.site/);
});
