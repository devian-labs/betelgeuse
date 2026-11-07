/** The shared interface's platform in a browser. */
import type { Platform } from "@betelgeuse/ui/platform";

type Listener = (event: { payload: unknown }) => void;

export function eventBus() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    emit: (event: string, payload: unknown) => listeners.get(event)?.forEach((l) => l({ payload })),
    listen: <T,>(event: string, handler: (event: { payload: T }) => void) => {
      const set = listeners.get(event) ?? new Set<Listener>();
      listeners.set(event, set);
      set.add(handler as Listener);
      return Promise.resolve(() => void set.delete(handler as Listener));
    },
  };
}

export function webPlatform(options: { invoke: Platform["invoke"]; listen: Platform["listen"]; account: NonNullable<Platform["account"]>; switchWorkspace: () => void }): Platform {
  return {
    kind: "web",
    invoke: options.invoke,
    listen: options.listen,
    openUrl: async (url) => void window.open(url, "_blank", "noopener,noreferrer"),
    confirm: async (message) => window.confirm(message),
    message: async (message) => window.alert(message),
    pickFolder: async () => null,
    pickImport: async () => null,
    version: async () => process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
    fileUrl: () => "",
    features: { agents: false, importer: false, pluginFolders: false, gitRemote: false, windowControls: false },
    switchWorkspace: options.switchWorkspace,
    account: options.account,
    env: { dev: process.env.NODE_ENV !== "production", unsplashKey: process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY ?? "" },
  };
}
