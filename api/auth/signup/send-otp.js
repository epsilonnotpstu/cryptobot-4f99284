import app from "../../../server/index.js";
import { createExpressRouteHandler } from "../../_shared/handleExpressRoute.js";

export default createExpressRouteHandler(app, "/api/auth/signup/send-otp");
