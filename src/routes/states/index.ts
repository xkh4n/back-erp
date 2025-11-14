/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('statesController');
logger.level = "all";

import { Router } from 'express';
const states = Router();

import {
    searchAllStates,
    searchStateById,
    searchStateByName,
    searchStateByCodTerritorial,
    searchStateByCodPostal,
    searchStateByCodSii,
    searchStatesByCity,
    searchStatesWithCities,
    addState,
    modifyState,
    removeState
} from '../../controllers/statesController';

// Rutas para estados
states.put('/newstate', addState);
states.post('/getstates', searchAllStates);
states.post('/statebyid', searchStateById);
states.post('/statebyname', searchStateByName);
states.post('/statebycodterritorial', searchStateByCodTerritorial);
states.post('/statebycodpostal', searchStateByCodPostal);
states.post('/statebycodsii', searchStateByCodSii);
states.post('/statesbycity', searchStatesByCity);
states.post('/stateswithcities', searchStatesWithCities);
states.post('/modifystate', modifyState);
states.delete('/removestate', removeState);

export default states;