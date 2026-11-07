// Plugin runtime: which plugins may run (versions, API, platform).
import assert from "node:assert/strict";
import { test } from "node:test";

const { satisfies, incompatibility, parseViewPath, setPlatform, viewPath } = await import("../../../packages/ui/src/plugins/runtime.ts");

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

test("the web app runs plugins made for it, and none that reach other websites", () => {
  const plugin = (extra) => ({ id: "p", name: "P", version: "1.0.0", engines: { api: "1" }, ...extra });
  setPlatform("web");
  try {
    assert.equal(incompatibility(plugin({ platforms: ["desktop", "web"] }), "0.5.0"), null);
    assert.match(incompatibility(plugin({}), "0.5.0"), /isn't made for the web app/, "desktop by default");
    assert.match(incompatibility(plugin({ platforms: ["desktop", "mobile"] }), "0.5.0"), /isn't made for the web app/);
    assert.match(incompatibility(plugin({ platforms: ["web"], permissions: ["network:api.example.com"] }), "0.5.0"), /other websites/);
  } finally {
    setPlatform("desktop");
  }
  assert.match(incompatibility(plugin({ platforms: ["web"] }), "0.5.0"), /isn't made for the desktop app/);
});
