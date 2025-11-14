/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('citiesRoutes');
logger.level = "all";

import { Router } from 'express';

/* CONTROLLERS */
import { addCity } from '../../controllers/citiesController';

/* MIDDLEWARES */
import { strictRateLimit } from '../../middlewares/rateLimiter';

const cities = Router();

// POST /cities - Crear una o múltiples ciudades
cities.put('/newcity', addCity);

export default cities;