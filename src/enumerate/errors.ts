/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('errorsEnumerate');
logger.level = "all";

import { IErrors } from "../interfaces/IErrors";

export const ERROR_CATALOG: IErrors[] = [
  // HTTP
    {
        code: 200,
        title: "OK",
        message: "Petición Exitosa",
        description: "La solicitud fue exitosa. El servidor devolvió la página HTML (u otro recurso) correctamente."
    },
    {
        code: 400,
        title: "Bad Request",
        message: "Solicitud incorrecta",
        description: "La solicitud del cliente es inválida o mal formada."
    },
    {
        code: 401,
        title: "Unauthorized",
        message: "Acceso no autorizado",
        description: "Se requiere autenticación para acceder al recurso."
    },
    {
        code: 403,
        title: "Forbidden",
        message: "Acceso prohibido",
        description: "El servidor entiende la solicitud, pero se niega a autorizarla."
    },
    {
        code: 404,
        title: "Not Found",
        message: "Recurso no encontrado",
        description: "El recurso solicitado no existe en el servidor."
    },
    {
        code: 405,
        title: "Method Not Allowed",
        message: "La solicitud no puede ser procesada",
        description: "El método HTTP usado (ej. POST en una página estática) no está permitido para ese recurso."
    },
    {
        code: 408,
        title: "Request Timeout",
        message: "Tiempo de espera agotado",
        description: "El servidor esperó demasiado tiempo a que el cliente enviara la solicitud."
    },
    {
        code: 429,
        title: "Too Many Requests",
        message: "Demasiadas solicitudes",
        description: "El cliente ha excedido el límite de solicitudes permitidas en un período de tiempo."
    },
    {
        code: 500,
        title: "Internal Server Error",
        message: "Error interno del servidor",
        description: "Ocurrió un error inesperado en el servidor al procesar la solicitud."
    },
    {
        code: 501,
        title: "Not Implemented",
        message: "Método no implementado",
        description: "El servidor no soporta la funcionalidad requerida para manejar la solicitud."
    },
    {
        code: 502,
        title: "Bad Gateway",
        message: "Puerta de enlace inválida",
        description: "El servidor, actuando como gateway, recibió una respuesta inválida de un servidor upstream."
    },
    {
        code: 503,
        title: "Service Unavailable",
        message: "La solicitud no está disponible en este momento",
        description: "El servidor no puede manejar la solicitud (sobrecarga, mantenimiento, etc.)."
    },
    {
        code: 504,
        title: "Gateway Timeout",
        message: "Tiempo de espera agotado en la puerta de enlace",
        description: "El servidor no recibió una respuesta oportuna de un servidor upstream."
    },

    // MSSQL errores
    {
        code: 18456,
        title: "Login failed",
        message: "Error en las credenciales del usuario",
        description: "Error de autenticación: credenciales incorrectas, usuario deshabilitado o cuenta bloqueada."
    },
    {
        code: 1205,
        title: "Transaction was deadlocked on lock resources with another process.",
        message: "Error al procesar la solicitud, intente más tarde",
        description: "Se produjo un interbloqueo (deadlock); SQL Server terminó la transacción actual para resolverlo."
    },
    {
        code: 2627,
        title: "Cannot insert duplicate key.",
        message: "Registro ya existe",
        description: "Intento de insertar un valor que ya existe en una columna con restricción de clave primaria."
    },
    {
        code: 547,
        title: "Foreign key constraint fails",
        message: "Violación de integridad referencial",
        description: "El valor de clave foránea no existe en la tabla referenciada."
    },
    {
        code: 208,
        title: "Invalid object name",
        message: "Objeto no encontrado",
        description: "La tabla o vista referenciada no existe en la base de datos."
    },
    {
        code: 207,
        title: "Invalid column name",
        message: "Columna no válida",
        description: "La columna especificada no existe en la tabla."
    },
    {
        code: 8152,
        title: "String or binary data would be truncated",
        message: "Datos demasiado largos",
        description: "Se intentó insertar un valor más largo que la capacidad definida en la columna."
    },
    {
        code: 1801,
        title: "Database already exists",
        message: "Base de datos en uso",
        description: "Intento de crear una base de datos con un nombre que ya está en uso."
    }
];