// Plugin runtime: which plugins may run (versions, API, platform).
import assert from "node:assert/strict";
import { test } from "node:test";

const { satisfies, incompatibility, parseViewPath, viewPath } = await import("../src/plugins/runtime.ts");

test("version ranges", () => {
  assert.ok(satisfies("0.4.0", ">=0.4.0 <1.0.0"));
  assert.ok(!satisfies("1.0.0", ">=0.4.0 <1.0.0"));
  assert.ok(!satisfies("0.3.9", ">=0.4.0"));
  assert.ok(satisfies("0.4.7", "^0.4.0"));
  assert.ok(!satisfies("0.5.0", "^0.4.0"));
  assert.ok(satisfies("1.9.0", "^1.2.0"));
  assert.ok(!satisfies("2.0.0", "^1.2.0"));
  assert.ok(satisfies("0.4.3", "~0.4.1"));
  assert.ok(!satisfies("0.5.0", "~0.4.1"));
  assert.ok(satisfies("0.4.9", "0.4.x"));
  assert.ok(satisfies("3.0.0", "*"));
  assert.ok(satisfies("0.2.0", "<0.3.0 || >=1.0.0"));
  assert.ok(satisfies("0.4.0-beta.1", ">=0.4.0"));
});

test("plugins that can't run say why", () => {
  const ok = { id: "x", name: "X", version: "1.0.0", engines: { betelgeuse: ">=0.3.0", api: "1" } };
  assert.equal(incompatibility(ok, "0.3.0"), null);
  assert.match(incompatibility({ ...ok, engines: { betelgeuse: ">=0.9.0", api: "1" } }, "0.3.0"), /needs Betelgeuse >=0.9.0/);
  assert.match(incompatibility({ ...ok, engines: { betelgeuse: "*", api: "2" } }, "0.3.0"), /plugin API 2/);
  assert.match(incompatibility({ ...ok, platforms: ["mobile"] }, "0.3.0"), /desktop/);
  assert.match(incompatibility({ ...ok, id: "" }, "0.3.0"), /missing/);
});

test("plugin view paths", () => {
  assert.equal(viewPath("hello-world", "hello"), "@plugin/hello-world/hello");
  assert.deepEqual(parseViewPath("@plugin/hello-world/hello"), { pluginId: "hello-world", viewId: "hello" });
  assert.equal(parseViewPath("Projects/Launch.md"), null);
});
