import { createLazyExpressRouteHandler } from "../../_shared/handleExpressRoute.js";
import { loadFreshServerApp } from "../../_shared/loadServerApp.js";

export default createLazyExpressRouteHandler(loadFreshServerApp, "/api/auth/signup/complete");
