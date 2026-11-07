// The session cookie and the plugin checks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { PLUGIN_PUBLIC_KEY, unpackPlugin, validId, verifyPlugin } from "../lib/plugins.ts";
import { seal, unseal } from "../lib/server/session.ts";
import { indexUrl, zipUrl } from "../lib/server/plugin-store.ts";

test("sessions are sealed", () => {
  const sealed = seal({ token: "ghu_secret" }, "s3cret");
  assert.ok(!Buffer.from(sealed, "base64url").toString().includes("ghu_secret"));
  assert.deepEqual(unseal(sealed, "s3cret"), { token: "ghu_secret" });
  assert.equal(unseal(sealed, "other"), null, "another secret can't open it");
  assert.equal(unseal(`${sealed.slice(0, -2)}xx`, "s3cret"), null, "tampering is noticed");
  assert.equal(unseal(undefined, "s3cret"), null);
  assert.equal(unseal("garbage", "s3cret"), null);
});

test("the web app trusts the same plugin key as the other apps", () => {
  const key = readFileSync(new URL("../../../crates/betelgeuse-core/plugin-signing.pub", import.meta.url), "utf8").trim();
  assert.equal(PLUGIN_PUBLIC_KEY, key);
});

const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const sha256 = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))].map((x) => x.toString(16).padStart(2, "0")).join("");

test("plugins install only with a good checksum and signature", async () => {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64");
  const bytes = zip({ "betelgeuse-plugin.json": JSON.stringify({ id: "p", version: "1.0.0" }), "main.js": "exports.activate = () => {}" });
  const signature = Buffer.from(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, bytes as Uint8Array<ArrayBuffer>)).toString("base64");
  const entry = { name: "P", sha256: await sha256(bytes), signature };

  await verifyPlugin(bytes, entry, publicKey);
  await assert.rejects(verifyPlugin(bytes, { ...entry, sha256: "00" }, publicKey), /damaged/);
  await assert.rejects(verifyPlugin(bytes, { ...entry, signature: "" }, publicKey), /isn't signed/);
  await assert.rejects(verifyPlugin(bytes, entry), /isn't signed by Betelgeuse/, "signed, but not with the store's key");
  const other = zip({ "main.js": "evil()" });
  await assert.rejects(verifyPlugin(other, { ...entry, sha256: await sha256(other) }, publicKey), /isn't signed by Betelgeuse/);
});

test("plugin packages must be what the store listed", () => {
  const manifest = JSON.stringify({ id: "p", version: "1.0.0" });
  const ok = unpackPlugin(zip({ "betelgeuse-plugin.json": manifest, "main.js": "x" }), { id: "p", version: "1.0.0" });
  assert.equal(ok.files["main.js"], "x");
  assert.throws(() => unpackPlugin(zip({ "betelgeuse-plugin.json": manifest, "main.js": "x" }), { id: "q", version: "1.0.0" }), /doesn't match/);
  assert.throws(() => unpackPlugin(zip({ "main.js": "x" }), { id: "p", version: "1.0.0" }), /no manifest/);
  assert.throws(() => unpackPlugin(zip({ "betelgeuse-plugin.json": manifest }), { id: "p", version: "1.0.0" }), /main\.js is missing/);
  assert.throws(() => unpackPlugin(zip({ "betelgeuse-plugin.json": manifest, "main.js": "x", "../evil": "x" }), { id: "p", version: "1.0.0" }), /unsafe/);
  assert.ok(validId("media-library") && !validId("../evil") && !validId("Upper") && !validId("-x") && !validId(""));
});

test("plugin downloads stay beside the store's list", () => {
  const url = (u: string) => zipUrl({ id: "p", url: u })?.href ?? null;
  assert.equal(indexUrl(), "https://github.com/devian-labs/betelgeuse/releases/latest/download/plugins.json");
  assert.equal(url("plugin-p-1.0.0.zip"), "https://github.com/devian-labs/betelgeuse/releases/latest/download/plugin-p-1.0.0.zip");
  assert.ok(url("https://github.com/devian-labs/betelgeuse/releases/download/v1/p.zip"));
  assert.equal(url("https://evil.example/p.zip"), null);
  assert.equal(url("http://169.254.169.254/latest"), null);
  assert.equal(url("https://github.com/someone-else/repo/p.zip"), null);
});
