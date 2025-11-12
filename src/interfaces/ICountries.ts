/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('ICountries');
logger.level = "all";

export interface ICountry {
    id: number;
    iso_code: string;
    name_country: string;
    iata_code: string;
    createdAt?: Date;
    updatedAt?: Date;
}