const baseServerModuleUrl = new URL("../../server/index.js", import.meta.url);

let cachedAppPromise = null;

export function loadFreshServerApp() {
  if (!cachedAppPromise) {
    cachedAppPromise = import(baseServerModuleUrl.href).then((module) => module.default);
  }
  return cachedAppPromise;
}
