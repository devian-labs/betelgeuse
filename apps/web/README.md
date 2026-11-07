# Betelgeuse for the web

The same interface as the desktop app, in a browser. A workspace is a GitHub repository: pages are Markdown files in it, and every change is a commit made as you.

Your notes never pass through this server. The page calls GitHub's API directly, and the server's only jobs are to hold the sign-in session in an encrypted cookie and to pass along the public plugin store.

## Run it

**1. Register a GitHub App** at [github.com/settings/apps/new](https://github.com/settings/apps/new):

| Setting | Value |
|---|---|
| Homepage URL | Where it's hosted: `https://app.betelgeuse.pro` for ours |
| Callback URLs | `<homepage>/api/auth/callback`, and `http://localhost:3100/api/auth/callback` to develop locally |
| Expire user authorization tokens | On |
| Request user authorization (OAuth) during installation | Off |
| Setup URL (under Post installation) | `<homepage>/` |
| Webhook | Off |
| Repository permissions | **Contents: Read and write**. Metadata: Read-only is added for you. |
| Where can this app be installed? | Any account, to let other people use your deployment |

It's a GitHub App and not an OAuth App because people choose exactly which repositories it can reach, while an OAuth App would get all of them.

**2. Set its details.** Copy `.env.example` to `.env.local` and fill it in. Generate a client secret on the app's page, and use `openssl rand -base64 32` for `SESSION_SECRET`.

**3. Start it** from the repository root:

```sh
npm install
npm run plugins                  # optional: lists the plugins built here, in development
npm run dev -w @betelgeuse/web   # http://localhost:3100
```

## Deploy it

Any host that runs Next.js works. On Vercel, make a project with the root directory `apps/web`, and add the same variables, plus `APP_URL` (`https://app.betelgeuse.pro` for ours) for production only. The website in `apps/lander` is its own project, at `betelgeuse.pro`.

## Tests

```sh
npm test -w @betelgeuse/web      # the workspace rules, sync, sessions and plugin checks
npm run e2e -w @betelgeuse/web   # the whole app in Chrome (needs `npm run plugins`)
```

Both use `tests/fake-github.ts`, a small GitHub with real hashing and fast-forward rules. `E2E_MODE=start` runs the browser test against a production build.

## How it works

- **`lib/workspace.ts`** holds the repository's files in memory. Edits go straight into the browser's IndexedDB, so a closed tab loses nothing, then to GitHub as commits. Pulling merges as the other apps do: different lines both survive, and when the same lines changed, the other device's version keeps the page with yours beside it as "(conflicted copy)".
- **Opening is immediate.** The page list comes first, and pages load in the background, three requests at a time, with any page you open going first. Search and backlinks cover what's arrived so far. Renames, moves and syncing wait until every page is here, since they rewrite links and keep private page names out of commit messages.
- **`lib/vault.ts`** is the workspace's rules, ported from `crates/betelgeuse-core/src/vault.rs`. Keep them in step.
- **`lib/commands.ts`** answers the shared interface in the same words as the desktop app's Tauri commands. `@betelgeuse/ui` doesn't know which backend it has.

## Limits

- GitHub only, on the repository's default branch.
- No AI agents over MCP, importing, or media library: those need a computer's files and processes.
- A file's "edited" and "created" times are only as good as what this browser has seen: on first opening, every page gets the date of the latest commit.
- Browsers keep ⌘N, ⌘T and ⌘W for themselves, so those shortcuts don't reach the app in a normal tab.
- Plugins can't use `network:` permissions: the content security policy lets a page talk only to this site, GitHub and Unsplash, to keep a workspace from leaving for anywhere else.
- Plugins run in the page, as they do in the other apps, so a plugin could reach the signed-in person's GitHub token. Only signed store plugins can be installed here.
