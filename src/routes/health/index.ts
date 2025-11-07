/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('healthRoutes');
logger.level = "all";

import { Router } from "express";
const health = Router();

import { healthCheck } from "../../controllers/healthController";

health.get("/health", healthCheck);

export default health;