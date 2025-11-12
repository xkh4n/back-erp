/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('ICities');
logger.level = "all";

export interface ICity {
    id: number;
    name_city: string;
    iata_codes: string;
    countryId: number;
    createdAt?: Date;
    updatedAt?: Date;
}