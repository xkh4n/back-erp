/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('manageErrors');
logger.level = "all";

import { IErrors } from "../interfaces/IErrors";
import { ERROR_CATALOG } from "../enumerate/errors";

export const getErrorByCode = (code: number): IErrors => {
    const error = ERROR_CATALOG.find(err => err.code === code);
    if (error) {
        return { ...error }; // retorna copia limpia
    }

    // Si no se encuentra, devuelve un error genérico
    return {
        code,
        title: "Unknown Error",
        message: "Ocurrió un error inesperado",
        description: `No se encontró información detallada para el código de error ${code}.`
    };
}