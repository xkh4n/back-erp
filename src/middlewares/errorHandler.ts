/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('errorHandler');
logger.level = "all";

import { Request, Response, NextFunction } from 'express';
import { getErrorByCode } from "../utils/manageErrors";

// Interface para errores personalizados
interface CustomError extends Error {
    statusCode?: number;
    code?: number;
    additionalData?: any;
}

// Middleware global para manejo de errores
export const globalErrorHandler = (
    error: CustomError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Log del error completo
    logger.error('Error capturado por middleware global:', {
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode,
        code: error.code,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });

    // Determinar el código de error HTTP
    let httpStatusCode = error.statusCode || 500;
    let errorCode = error.code || httpStatusCode;

    // Analizar tipos específicos de errores
    if (error.message) {
        const message = error.message.toLowerCase();
        
        // Errores de base de datos
        if (message.includes('connection') || message.includes('econnrefused')) {
            errorCode = 503; // Service Unavailable
            httpStatusCode = 503;
        } else if (message.includes('timeout')) {
            errorCode = 504; // Gateway Timeout
            httpStatusCode = 504;
        } else if (message.includes('duplicate') || message.includes('2627')) {
            errorCode = 2627; // Duplicate key
            httpStatusCode = 409; // Conflict
        } else if (message.includes('foreign key') || message.includes('547')) {
            errorCode = 547; // Foreign key constraint
            httpStatusCode = 400; // Bad Request
        } else if (message.includes('invalid object name') || message.includes('208')) {
            errorCode = 208; // Invalid object name
            httpStatusCode = 500;
        } else if (message.includes('invalid column name') || message.includes('207')) {
            errorCode = 207; // Invalid column name
            httpStatusCode = 500;
        } else if (message.includes('login failed') || message.includes('18456')) {
            errorCode = 18456; // Login failed
            httpStatusCode = 401;
        } else if (message.includes('deadlock') || message.includes('1205')) {
            errorCode = 1205; // Deadlock
            httpStatusCode = 503;
        }
    }

    // Obtener información del error usando nuestro catálogo
    const errorInfo = getErrorByCode(errorCode);

    // Preparar respuesta
    const response: any = {
        success: false,
        error: {
            code: errorInfo.code,
            title: errorInfo.title,
            message: errorInfo.message,
            description: errorInfo.description,
            timestamp: new Date().toISOString(),
            requestId: generateRequestId()
        }
    };

    // Agregar información adicional si existe
    if (error.additionalData) {
        response.error.additionalInfo = error.additionalData;
    }

    // En desarrollo, agregar stack trace
    if (process.env.NODE_ENV === 'development') {
        response.error.stack = error.stack;
        response.error.originalMessage = error.message;
    }

    res.status(httpStatusCode).json(response);
};

// Middleware para capturar errores 404 (rutas no encontradas)
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
    const errorInfo = getErrorByCode(404);
    
    logger.warn('Ruta no encontrada:', {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });

    res.status(404).json({
        success: false,
        error: {
            code: errorInfo.code,
            title: errorInfo.title,
            message: errorInfo.message,
            description: errorInfo.description,
            requestedRoute: req.url,
            requestedMethod: req.method,
            timestamp: new Date().toISOString(),
            requestId: generateRequestId()
        }
    });
};

// Función para generar ID único de request
const generateRequestId = (): string => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Función auxiliar para crear errores personalizados
export const createError = (code: number, additionalData?: any): CustomError => {
    const errorInfo = getErrorByCode(code);
    const error = new Error(errorInfo.message) as CustomError;
    error.statusCode = code;
    error.code = code;
    error.additionalData = additionalData;
    return error;
};