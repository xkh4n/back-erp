/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('healthController');
logger.level = "all";

import { Request, Response } from "express";
import os from "os";

const healthCheck = (req: Request, res: Response) => {
    res.status(200).json({ 
        status: "ok", 
        message: "API funcionando perfectamente!",
        server: os.hostname(), // Identificador del contenedor
        timestamp: new Date().toISOString(),
        version: "1.1"
    });
};

export { healthCheck };