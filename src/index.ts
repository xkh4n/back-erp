/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger();
logger.level = "all";

/* API */
import app from './server';

/* BDD */
import { getConnection } from "./utils/database";

const port = Number(process.env.BACK_PORT_INTERNAL || 3000);
logger.debug(process.env.DB_HOST);
(async () => {
    try {
        //logger.warn(`Connecting to ${SERVER}...`);
        await getConnection();
        await app.listen(port, () => {
            logger.debug(`Server is Running in: http://localhost:${port}/api/${process.env.API_VERSION}/`);
        });
    } catch (error) {
        logger.error("Connection to BDD is Fail: ", error);
    }
})();