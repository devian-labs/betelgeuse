// At run time the app provides this module to plugins (with the same exports); this file only
// lets plugin code and tests import it outside the app.
export const API_VERSION = 1;
export const definePlugin = (plugin) => plugin;
