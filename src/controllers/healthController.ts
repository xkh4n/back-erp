/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('healthController');
logger.level = "all";

import { Request, Response } from "express";

const healthCheck = (req: Request, res: Response) => {
    res.status(200).json({ 
        status: "ok", 
        message: "API funcionando perfectamente!",
        timestamp: new Date().toISOString(),
        version: "1.1"
    });
};

export { healthCheck };