const API_PREFIX = "/api";

function normalizePath(pathname) {
  if (!pathname) {
    return "/";
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function shouldUseFallbackPath(pathname) {
  return pathname === "/" || pathname === "/api" || pathname === "/api/";
}

function ensureApiPrefix(pathname) {
  if (pathname.startsWith(API_PREFIX)) {
    return pathname;
  }
  return `${API_PREFIX}${pathname}`;
}

export function createExpressRouteHandler(app, fallbackPath) {
  const normalizedFallback = normalizePath(fallbackPath);

  return function routeHandler(req, res) {
    const requestUrl = typeof req.url === "string" ? req.url : "";
    const [rawPath = "", rawQuery = ""] = requestUrl.split("?");
    const normalizedPath = normalizePath(rawPath);

    const finalPath = shouldUseFallbackPath(normalizedPath)
      ? normalizedFallback
      : ensureApiPrefix(normalizedPath);

    req.url = rawQuery ? `${finalPath}?${rawQuery}` : finalPath;
    return app(req, res);
  };
}

export function createLazyExpressRouteHandler(loadApp, fallbackPath) {
  const normalizedFallback = normalizePath(fallbackPath);

  return async function routeHandler(req, res) {
    const requestUrl = typeof req.url === "string" ? req.url : "";
    const [rawPath = "", rawQuery = ""] = requestUrl.split("?");
    const normalizedPath = normalizePath(rawPath);

    const finalPath = shouldUseFallbackPath(normalizedPath)
      ? normalizedFallback
      : ensureApiPrefix(normalizedPath);

    req.url = rawQuery ? `${finalPath}?${rawQuery}` : finalPath;

    const app = await loadApp();
    return app(req, res);
  };
}
