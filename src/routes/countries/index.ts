/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('countriesRoutes');
logger.level = "all";

import { Router } from 'express';
const country = Router();

import { setCountries, getCountries, countryById } from "../../controllers/countriesController";

// Ruta para insertar países
country.put('/nuevopais', setCountries);
country.post('/obtenerpaises', getCountries);
country.post('/paisporid', countryById);

export default country;