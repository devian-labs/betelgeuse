#!/usr/bin/env node
// Creates the Ed25519 key pair that signs store plugins.
//
//   node scripts/plugin-keys.mjs [private-key-path]
//
// Writes the public key (base64 of the raw 32 bytes) to crates/betelgeuse-core/plugin-signing.pub,
// which the app is built with, and the private key (PKCS#8 PEM) to ~/.betelgeuse/plugin-signing-key.pem
// (or the path given). Never commit the private key: add it to the repository's Actions secrets as
// PLUGIN_SIGNING_KEY. Running this again makes a new pair, and plugins signed with the old key will
// no longer install in builds with the new public key.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const privatePath = process.argv[2] ?? path.join(homedir(), ".betelgeuse", "plugin-signing-key.pem");
if (existsSync(privatePath)) {
  console.error(`${privatePath} already exists. Move it away first if you really want a new key pair.`);
  process.exit(1);
}
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
// The SPKI DER of an Ed25519 key ends with the raw 32-byte key.
const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
writeFileSync(path.join(root, "crates/betelgeuse-core/plugin-signing.pub"), raw.toString("base64") + "\n");
mkdirSync(path.dirname(privatePath), { recursive: true });
writeFileSync(privatePath, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
console.log(`Public key → crates/betelgeuse-core/plugin-signing.pub (commit this)`);
console.log(`Private key → ${privatePath} (add its contents to the PLUGIN_SIGNING_KEY Actions secret; never commit it)`);
