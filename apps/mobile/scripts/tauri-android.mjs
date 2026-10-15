// Runs `tauri android …` with each Android target's `ranlib` pointed at the NDK's llvm-ranlib.
// OpenSSL (built in for git sync) otherwise asks for `<target>-ranlib`, which NDK r23 and later
// no longer ship. Usage: node scripts/tauri-android.mjs dev|build [tauri options]
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const env = { ...process.env };
const sdk =
  env.ANDROID_HOME ??
  env.ANDROID_SDK_ROOT ??
  join(homedir(), { darwin: "Library/Android/sdk", win32: "AppData/Local/Android/Sdk" }[process.platform] ?? "Android/Sdk");
const ndks = existsSync(join(sdk, "ndk")) ? readdirSync(join(sdk, "ndk")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
const ndk = env.NDK_HOME ?? (ndks.length ? join(sdk, "ndk", ndks.at(-1)) : undefined);
if (!ndk) {
  console.error("No Android NDK found: install one with Android Studio's SDK Manager, or set NDK_HOME.");
  process.exit(1);
}
env.ANDROID_HOME ??= sdk;
env.NDK_HOME ??= ndk;

// The NDK's prebuilt tools are in darwin-x86_64 on every Mac (they're universal binaries).
const host = { darwin: "darwin-x86_64", linux: "linux-x86_64", win32: "windows-x86_64" }[process.platform];
const ranlib = join(ndk, "toolchains/llvm/prebuilt", host, "bin", process.platform === "win32" ? "llvm-ranlib.exe" : "llvm-ranlib");
for (const target of ["aarch64-linux-android", "armv7-linux-androideabi", "i686-linux-android", "x86_64-linux-android"]) {
  env[`RANLIB_${target.replaceAll("-", "_")}`] ??= ranlib;
}

const child = spawn("npx", ["tauri", "android", ...process.argv.slice(2)], { stdio: "inherit", env, shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 1));
