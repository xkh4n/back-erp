/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('databaseErrorHandler');
logger.level = "all";

import { Request, Response, NextFunction } from 'express';
import { getErrorByCode } from "../utils/manageErrors";

// Interface para configuración de reintentos
interface RetryConfig {
    maxRetries: number;
    baseDelay: number;    // Delay base en ms
    maxDelay: number;     // Delay máximo en ms
    backoffFactor: number; // Factor de incremento exponencial
}

// Configuración por defecto de reintentos
const defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,     // 1 segundo
    maxDelay: 10000,     // 10 segundos
    backoffFactor: 2
};

// Estado de salud de la base de datos
interface DatabaseHealth {
    isHealthy: boolean;
    lastCheck: number;
    failureCount: number;
    lastError?: string;
}

const dbHealth: DatabaseHealth = {
    isHealthy: true,
    lastCheck: Date.now(),
    failureCount: 0
};

// Tipos de errores de base de datos
enum DatabaseErrorType {
    CONNECTION_ERROR = 'CONNECTION_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
    DEADLOCK_ERROR = 'DEADLOCK_ERROR',
    CONSTRAINT_ERROR = 'CONSTRAINT_ERROR',
    SYNTAX_ERROR = 'SYNTAX_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Función para clasificar errores de base de datos
export const classifyDatabaseError = (error: any): DatabaseErrorType => {
    if (!error || !error.message) return DatabaseErrorType.UNKNOWN_ERROR;
    
    const message = error.message.toLowerCase();
    
    if (message.includes('connection') || 
        message.includes('econnrefused') || 
        message.includes('enotfound') ||
        message.includes('network')) {
        return DatabaseErrorType.CONNECTION_ERROR;
    }
    
    if (message.includes('timeout') || 
        message.includes('etimedout')) {
        return DatabaseErrorType.TIMEOUT_ERROR;
    }
    
    if (message.includes('login failed') || 
        message.includes('authentication') ||
        message.includes('18456')) {
        return DatabaseErrorType.AUTHENTICATION_ERROR;
    }
    
    if (message.includes('deadlock') || 
        message.includes('1205')) {
        return DatabaseErrorType.DEADLOCK_ERROR;
    }
    
    if (message.includes('constraint') || 
        message.includes('foreign key') ||
        message.includes('duplicate') ||
        message.includes('2627') ||
        message.includes('547')) {
        return DatabaseErrorType.CONSTRAINT_ERROR;
    }
    
    if (message.includes('syntax') || 
        message.includes('invalid') ||
        message.includes('207') ||
        message.includes('208')) {
        return DatabaseErrorType.SYNTAX_ERROR;
    }
    
    return DatabaseErrorType.UNKNOWN_ERROR;
};

// Función para determinar si un error es retryable
const isRetryableError = (errorType: DatabaseErrorType): boolean => {
    switch (errorType) {
        case DatabaseErrorType.CONNECTION_ERROR:
        case DatabaseErrorType.TIMEOUT_ERROR:
        case DatabaseErrorType.DEADLOCK_ERROR:
            return true;
        case DatabaseErrorType.AUTHENTICATION_ERROR:
        case DatabaseErrorType.CONSTRAINT_ERROR:
        case DatabaseErrorType.SYNTAX_ERROR:
            return false;
        default:
            return false;
    }
};

// Función para obtener el código de error HTTP apropiado
const getHttpStatusForDatabaseError = (errorType: DatabaseErrorType): number => {
    switch (errorType) {
        case DatabaseErrorType.CONNECTION_ERROR:
        case DatabaseErrorType.TIMEOUT_ERROR:
            return 503; // Service Unavailable
        case DatabaseErrorType.AUTHENTICATION_ERROR:
            return 500; // Internal Server Error (no mostrar detalles de auth)
        case DatabaseErrorType.DEADLOCK_ERROR:
            return 503; // Service Unavailable
        case DatabaseErrorType.CONSTRAINT_ERROR:
            return 409; // Conflict
        case DatabaseErrorType.SYNTAX_ERROR:
            return 500; // Internal Server Error
        default:
            return 500;
    }
};

// Función para ejecutar operación con reintentos
export const executeWithRetry = async <T>(
    operation: () => Promise<T>,
    config: RetryConfig = defaultRetryConfig
): Promise<T> => {
    let lastError: any;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            const result = await operation();
            
            // Si la operación fue exitosa, marcar BD como saludable
            if (attempt > 0) {
                dbHealth.isHealthy = true;
                dbHealth.failureCount = 0;
                logger.info(`Operación exitosa después de ${attempt} reintentos`);
            }
            
            return result;
            
        } catch (error) {
            lastError = error;
            const errorType = classifyDatabaseError(error);
            
            logger.warn(`Intento ${attempt + 1}/${config.maxRetries + 1} falló:`, {
                error: error.message,
                errorType,
                timestamp: new Date().toISOString()
            });
            
            // Actualizar estado de salud de la BD
            dbHealth.isHealthy = false;
            dbHealth.lastCheck = Date.now();
            dbHealth.failureCount++;
            dbHealth.lastError = error.message;
            
            // Si no es retryable o es el último intento, lanzar error
            if (!isRetryableError(errorType) || attempt === config.maxRetries) {
                throw error;
            }
            
            // Calcular delay con backoff exponencial
            const delay = Math.min(
                config.baseDelay * Math.pow(config.backoffFactor, attempt),
                config.maxDelay
            );
            
            // Agregar jitter aleatorio (±25%)
            const jitter = delay * (0.75 + Math.random() * 0.5);
            
            logger.info(`Esperando ${Math.round(jitter)}ms antes del siguiente intento...`);
            await new Promise(resolve => setTimeout(resolve, jitter));
        }
    }
    
    throw lastError;
};

// Middleware para manejo de errores de base de datos
export const databaseErrorHandler = (
    error: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const errorType = classifyDatabaseError(error);
    const isDbError = errorType !== DatabaseErrorType.UNKNOWN_ERROR;
    
    // Si no es un error de BD, pasar al siguiente middleware
    if (!isDbError) {
        return next(error);
    }
    
    // Log detallado del error de BD
    logger.error('Error de base de datos detectado:', {
        errorType,
        message: error.message,
        url: req.url,
        method: req.method,
        ip: req.ip,
        dbHealth: { ...dbHealth },
        timestamp: new Date().toISOString()
    });
    
    // Determinar código de error y respuesta
    const httpStatus = getHttpStatusForDatabaseError(errorType);
    let errorCode = httpStatus;
    
    // Mapear tipos específicos a códigos del catálogo
    switch (errorType) {
        case DatabaseErrorType.CONNECTION_ERROR:
            errorCode = 503;
            break;
        case DatabaseErrorType.TIMEOUT_ERROR:
            errorCode = 504;
            break;
        case DatabaseErrorType.AUTHENTICATION_ERROR:
            errorCode = 18456;
            break;
        case DatabaseErrorType.DEADLOCK_ERROR:
            errorCode = 1205;
            break;
        case DatabaseErrorType.CONSTRAINT_ERROR:
            if (error.message.includes('duplicate') || error.message.includes('2627')) {
                errorCode = 2627;
            } else if (error.message.includes('foreign key') || error.message.includes('547')) {
                errorCode = 547;
            }
            break;
        case DatabaseErrorType.SYNTAX_ERROR:
            if (error.message.includes('207')) {
                errorCode = 207;
            } else if (error.message.includes('208')) {
                errorCode = 208;
            }
            break;
    }
    
    const errorInfo = getErrorByCode(errorCode);
    
    // Preparar respuesta
    const response: any = {
        success: false,
        error: {
            code: errorInfo.code,
            title: errorInfo.title,
            message: errorInfo.message,
            description: errorInfo.description,
            type: errorType,
            retryable: isRetryableError(errorType),
            timestamp: new Date().toISOString()
        }
    };
    
    // Agregar información adicional según el tipo de error
    if (errorType === DatabaseErrorType.CONNECTION_ERROR || 
        errorType === DatabaseErrorType.TIMEOUT_ERROR) {
        response.error.additionalInfo = {
            message: 'El servicio está temporalmente no disponible. Por favor, inténtelo más tarde.',
            estimatedRecoveryTime: '1-2 minutos'
        };
    } else if (errorType === DatabaseErrorType.DEADLOCK_ERROR) {
        response.error.additionalInfo = {
            message: 'Se detectó un conflicto de recursos. Por favor, reintente la operación.',
            suggestion: 'Espere unos segundos antes de reintentar'
        };
    }
    
    res.status(httpStatus).json(response);
};

// Función para verificar salud de la base de datos
export const checkDatabaseHealth = (): DatabaseHealth => {
    return { ...dbHealth };
};

// Endpoint de health check para la base de datos
export const databaseHealthCheck = async (req: Request, res: Response) => {
    try {
        // Aquí puedes agregar una consulta simple a la BD para verificar conectividad
        // Por ejemplo: await prisma.$queryRaw`SELECT 1`;
        
        dbHealth.isHealthy = true;
        dbHealth.lastCheck = Date.now();
        dbHealth.failureCount = 0;
        
        res.status(200).json({
            success: true,
            database: {
                status: 'healthy',
                lastCheck: new Date(dbHealth.lastCheck).toISOString(),
                failureCount: dbHealth.failureCount
            }
        });
    } catch (error) {
        dbHealth.isHealthy = false;
        dbHealth.lastCheck = Date.now();
        dbHealth.failureCount++;
        dbHealth.lastError = error instanceof Error ? error.message : 'Unknown error';
        
        const errorInfo = getErrorByCode(503);
        res.status(503).json({
            success: false,
            database: {
                status: 'unhealthy',
                lastCheck: new Date(dbHealth.lastCheck).toISOString(),
                failureCount: dbHealth.failureCount,
                lastError: dbHealth.lastError
            },
            error: {
                code: errorInfo.code,
                title: errorInfo.title,
                message: errorInfo.message,
                description: errorInfo.description
            }
        });
    }
};