/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('indexRoutes');
logger.level = "all";

import health from "./health";
import country from "./countries";
import cities from "./cities";
import states from "./states";

export {
    health,
    country,
    cities,
    states
}