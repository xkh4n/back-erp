/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('indexRoutes');
logger.level = "all";

import health from "./health";

export {
    health
}