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

// Interface para la entrada desde el frontend
export interface ICityInput {
    iata_codes: string;
    name_city: string;
    pais: string; // Código IATA del país
}

// Interface para respuesta con información del país
export interface ICityWithCountryInfo extends ICity {
    country?: {
        id: number;
        name_country: string;
        iso_code: string;
        iata_code: string;
    };
}