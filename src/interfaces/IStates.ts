/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('IStates');
logger.level = "all";

export interface IStates{
    id: number;
    name_comuna: string;
    cod_territorial: number;
    cod_postal: number;
    cod_sii:       number;
    cityId:        number;
    createdAt?: Date;
    updatedAt?: Date;
}