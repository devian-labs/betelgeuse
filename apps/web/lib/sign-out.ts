import { deleteAllLocalData } from "./store";
import { remember } from "./session";

/** Ends the session and removes everything this browser kept, so the next person here finds nothing. */
export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  await deleteAllLocalData();
  remember(null);
  try {
    for (const key of Object.keys(localStorage)) if (key.includes("github:")) localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
  window.location.assign("/");
}
