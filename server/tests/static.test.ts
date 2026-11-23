import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createStaticHandler } from "../static.ts";

test("static handler serves the SPA shell, assets and API fallthrough", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mechnow-static-"));
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "index.html"), "<!doctype html><div id=\"root\"></div>");
  writeFileSync(join(directory, "assets", "app-abc123.js"), "console.log('app');");
  writeFileSync(join(directory, "sw.js"), "self.addEventListener('fetch', () => {});");

  const handler = createStaticHandler(directory);
  assert.ok(handler, "handler should exist when dist/index.html is present");

  const server = createServer(async (req, res) => {
    if (!await handler(req, res)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "api" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const root = await fetch(`${base}/`);
    assert.equal(root.status, 200);
    assert.match(root.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await root.text(), /id="root"/);

    const deepLink = await fetch(`${base}/app/track/some-id`);
    assert.equal(deepLink.status, 200);
    assert.match(deepLink.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await deepLink.text(), /id="root"/);

    const asset = await fetch(`${base}/assets/app-abc123.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", /javascript/);
    assert.match(asset.headers.get("cache-control") ?? "", /immutable/);

    const worker = await fetch(`${base}/sw.js`);
    assert.equal(worker.status, 200);
    assert.equal(worker.headers.get("cache-control"), "no-cache");

    const missingAsset = await fetch(`${base}/assets/missing.js`);
    assert.equal(missingAsset.status, 404);

    const traversal = await fetch(`${base}/%2e%2e%2fpackage.json`);
    assert.equal(traversal.status, 400);

    const api = await fetch(`${base}/api/health`);
    assert.equal(api.status, 404);
    assert.match(api.headers.get("content-type") ?? "", /application\/json/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("static handler is disabled without a built client", () => {
  assert.equal(createStaticHandler(join(tmpdir(), "mechnow-static-missing")), null);
});
