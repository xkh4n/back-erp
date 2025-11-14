/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('rateLimiter');
logger.level = "all";

import { Request, Response, NextFunction } from 'express';
import { getErrorByCode } from "../utils/manageErrors";

// Interface para almacenar información de rate limiting
interface RateLimitInfo {
    count: number;
    resetTime: number;
    firstRequest: number;
}

// Almacén en memoria para rate limiting (en producción usar Redis)
const rateLimitStore = new Map<string, RateLimitInfo>();

// Límite máximo de entradas en el store para prevenir crecimiento ilimitado
const MAX_STORE_SIZE = 10000;

// Configuración por defecto del rate limiter
interface RateLimitConfig {
    windowMs: number;      // Ventana de tiempo en milisegundos
    maxRequests: number;   // Máximo número de requests por ventana
    message?: string;      // Mensaje personalizado
    keyGenerator?: (req: Request) => string; // Función para generar la clave
}

// Configuraciones predefinidas
export const rateLimitConfigs = {
    // Rate limiting general (100 requests por 15 minutos)
    general: {
        windowMs: 15 * 60 * 1000, // 15 minutos
        maxRequests: 100,
        message: 'Demasiadas solicitudes desde esta IP'
    },
    // Rate limiting estricto para operaciones de escritura (20 requests por 5 minutos)
    strict: {
        windowMs: 5 * 60 * 1000, // 5 minutos
        maxRequests: 20,
        message: 'Demasiadas operaciones de escritura desde esta IP'
    },
    // Rate limiting para lecturas (200 requests por 10 minutos)
    read: {
        windowMs: 10 * 60 * 1000, // 10 minutos
        maxRequests: 200,
        message: 'Demasiadas solicitudes de lectura desde esta IP'
    }
};

// Middleware de rate limiting
export const createRateLimiter = (config: RateLimitConfig) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            // Generar clave para identificar al cliente
            const key = config.keyGenerator ? 
                config.keyGenerator(req) : 
                getClientIdentifier(req);
            
            const now = Date.now();
            const windowStart = now - config.windowMs;
            
            // Obtener o crear información de rate limiting
            let clientInfo = rateLimitStore.get(key);
            
            if (!clientInfo || clientInfo.resetTime <= now) {
                // Primera request o ventana expirada
                clientInfo = {
                    count: 1,
                    resetTime: now + config.windowMs,
                    firstRequest: now
                };
                rateLimitStore.set(key, clientInfo);
                
                // Agregar headers informativos
                addRateLimitHeaders(res, config, clientInfo);
                
                return next();
            }
            
            // Limpiar requests antigas fuera de la ventana
            if (clientInfo.firstRequest < windowStart) {
                clientInfo.count = 1;
                clientInfo.firstRequest = now;
                rateLimitStore.set(key, clientInfo);
                
                addRateLimitHeaders(res, config, clientInfo);
                return next();
            }
            
            // Verificar si se excedió el límite
            if (clientInfo.count >= config.maxRequests) {
                // Log del rate limit excedido
                logger.warn('Rate limit excedido:', {
                    key,
                    count: clientInfo.count,
                    maxRequests: config.maxRequests,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    timestamp: new Date().toISOString()
                });
                
                // Obtener información del error 429
                const errorInfo = getErrorByCode(429);
                
                // Calcular tiempo de reset
                const resetTime = Math.ceil((clientInfo.resetTime - now) / 1000);
                
                // Agregar headers de rate limiting
                res.set({
                    'X-RateLimit-Limit': config.maxRequests.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(clientInfo.resetTime).toISOString(),
                    'Retry-After': resetTime.toString()
                });
                
                return res.status(429).json({
                    success: false,
                    error: {
                        code: errorInfo.code,
                        title: errorInfo.title,
                        message: config.message || errorInfo.message,
                        description: errorInfo.description,
                        retryAfter: resetTime,
                        resetTime: new Date(clientInfo.resetTime).toISOString(),
                        limit: config.maxRequests,
                        windowMs: config.windowMs,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
            // Incrementar contador
            clientInfo.count++;
            rateLimitStore.set(key, clientInfo);
            
            // Agregar headers informativos
            addRateLimitHeaders(res, config, clientInfo);
            
            next();
            
        } catch (error) {
            logger.error('Error en rate limiter:', error);
            // En caso de error, permitir la request para evitar bloqueos
            next();
        }
    };
};

// Función para obtener identificador del cliente
const getClientIdentifier = (req: Request): string => {
    // Usar IP + User-Agent para identificar clientes únicos
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 10)}`;
};

// Función para agregar headers de rate limiting
const addRateLimitHeaders = (
    res: Response, 
    config: RateLimitConfig, 
    clientInfo: RateLimitInfo
) => {
    const remaining = Math.max(0, config.maxRequests - clientInfo.count);
    
    res.set({
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(clientInfo.resetTime).toISOString(),
        'X-RateLimit-Window': config.windowMs.toString()
    });
};

// Función para limpiar entradas antigas del store (llamar periódicamente)
export const cleanupRateLimitStore = () => {
    const now = Date.now();
    let cleaned = 0;
    
    // Si el store es muy grande, limpiar más agresivamente
    if (rateLimitStore.size > MAX_STORE_SIZE) {
        rateLimitStore.clear();
        logger.warn(`Rate limit store excedió ${MAX_STORE_SIZE} entradas. Store limpiado completamente.`);
        return;
    }
    
    for (const [key, info] of rateLimitStore.entries()) {
        if (info.resetTime <= now) {
            rateLimitStore.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        logger.debug(`Limpieza de rate limit store: ${cleaned} entradas eliminadas (${rateLimitStore.size} restantes)`);
    }
};

// Rate limiters predefinidos para uso fácil
export const generalRateLimit = createRateLimiter(rateLimitConfigs.general);
export const strictRateLimit = createRateLimiter(rateLimitConfigs.strict);
export const readRateLimit = createRateLimiter(rateLimitConfigs.read);

// Configurar limpieza automática cada 5 minutos (más frecuente)
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);