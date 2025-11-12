/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('countriesController');
logger.level = "all";

import { Request, Response, NextFunction } from 'express';
import { setOnlyCountry, CreateCountryData, getAllCountries, getCountryById } from '../models/countriesModel';
import { validateCountryFields, sanitizeString } from '../library/validations';
import { getErrorByCode } from "../utils/manageErrors";
import { executeWithRetry, classifyDatabaseError } from "../middlewares/databaseErrorHandler";
import { createError } from "../middlewares/errorHandler";

// Función auxiliar para enviar respuestas de error
const sendErrorResponse = (res: Response, errorCode: number, additionalData?: any) => {
    const errorInfo = getErrorByCode(errorCode);
    const response: any = {
        error: {
            code: errorInfo.code,
            title: errorInfo.title,
            message: errorInfo.message,
            description: errorInfo.description
        }
    };
    
    // Agregar datos adicionales si se proporcionan
    if (additionalData) {
        response.additionalInfo = additionalData;
    }
    
    return res.status(errorCode).json(response);
};

const setCountries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const requestData = req.body;
        
        // Determinar si es un país individual o un array de países
        const isArray = Array.isArray(requestData);
        const countriesData: CreateCountryData[] = isArray ? requestData : [requestData];
        
        // Validar que hay datos para procesar
        if (!countriesData || countriesData.length === 0) {
            return sendErrorResponse(res, 400, {
                reason: 'Se requiere al menos un país para procesar',
                received: requestData
            });
        }

        // Arrays para almacenar resultados y errores
        const results: any[] = [];
        const errors: any[] = [];

        // Procesar cada país
        for (let i = 0; i < countriesData.length; i++) {
            const countryData = countriesData[i];
            
            try {
                // Validar campos requeridos
                if (!countryData.iso_code || !countryData.name_country || !countryData.iata_code) {
                    errors.push({
                        index: i,
                        country: countryData,
                        error: getErrorByCode(400),
                        details: 'Campos requeridos: iso_code, name_country, iata_code'
                    });
                    continue;
                }

                // Validar y sanitizar campos
                const validationResult = validateCountryFields(countryData);
                if (!validationResult.isValid) {
                    errors.push({
                        index: i,
                        country: countryData,
                        error: getErrorByCode(400),
                        details: 'Error en validación de campos',
                        validationErrors: validationResult.errors
                    });
                    continue;
                }

                // Usar datos sanitizados con retry automático para operaciones de BD
                const sanitizedCountryData = validationResult.sanitizedData!;
                
                const createdCountry = await executeWithRetry(async () => {
                    return await setOnlyCountry(sanitizedCountryData);
                });
                
                results.push({
                    index: i,
                    success: true,
                    country: createdCountry
                });

            } catch (error) {
                logger.error(`Error procesando país en índice ${i}:`, error);
                
                // Clasificar el error para determinar el código apropiado
                const errorType = classifyDatabaseError(error);
                let errorCode = 500;
                let errorDetails = error instanceof Error ? error.message : 'Error desconocido';
                
                // Mapear tipos de error específicos
                if (error instanceof Error) {
                    const message = error.message.toLowerCase();
                    if (message.includes('duplicate') || message.includes('2627')) {
                        errorCode = 2627;
                    } else if (message.includes('foreign key') || message.includes('547')) {
                        errorCode = 547;
                    } else if (message.includes('connection') || message.includes('econnrefused')) {
                        errorCode = 503;
                    } else if (message.includes('timeout')) {
                        errorCode = 504;
                    } else if (message.includes('deadlock') || message.includes('1205')) {
                        errorCode = 1205;
                    }
                }
                
                errors.push({
                    index: i,
                    country: countryData,
                    error: getErrorByCode(errorCode),
                    details: errorDetails,
                    errorType
                });
            }
        }

        // Preparar respuesta basada en los resultados
        const totalProcessed = results.length + errors.length;
        const successCount = results.length;
        const errorCount = errors.length;

        // Si es un solo país
        if (!isArray) {
            if (results.length > 0) {
                return res.status(201).json({
                    success: true,
                    message: 'País insertado correctamente',
                    data: {
                        country: results[0].country
                    }
                });
            } else {
                return sendErrorResponse(res, 400, {
                    reason: 'Error insertando país',
                    errorDetails: errors[0]?.error || getErrorByCode(500),
                    validationErrors: errors[0]?.validationErrors
                });
            }
        }

        // Si es un array de países
        const responseStatus = errorCount === 0 ? 201 : (successCount === 0 ? 400 : 207); // 207 = Multi-Status

        return res.status(responseStatus).json({
            success: errorCount === 0,
            message: `Procesados ${totalProcessed} países: ${successCount} exitosos, ${errorCount} con errores`,
            data: {
                summary: {
                    total: totalProcessed,
                    successful: successCount,
                    errors: errorCount
                },
                results: successCount > 0 ? results : undefined,
                errors: errorCount > 0 ? errors : undefined
            }
        });

    } catch (error) {
        logger.error('Error general en setCountries:', error);
        // Usar next() para que el middleware global maneje el error
        return next(createError(500, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'setCountries'
        }));
    }
};

const getCountries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Usar executeWithRetry para obtener países con retry automático
        const countries = await executeWithRetry(async () => {
            return await getAllCountries();
        });
        
        if (!countries || countries.length === 0) {
            return sendErrorResponse(res, 404, {
                reason: 'No se encontraron países en la base de datos',
                timestamp: new Date().toISOString()
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Países obtenidos correctamente',
            data: {
                count: countries.length,
                countries
            }
        });
    } catch (error) {
        logger.error('Error general en getCountries:', error);
        
        // Clasificar el error y usar next() para el middleware global
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            } else if (message.includes('invalid object name') || message.includes('208')) {
                errorCode = 208;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'getCountries',
            errorType
        }));
    }
};

const countryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Obtener ID desde params en lugar de body (más RESTful)
        const countryId = req.params.id || req.body.id;
        
        if (!countryId) {
            return sendErrorResponse(res, 400, {
                reason: 'ID del país es requerido',
                expectedFormat: 'Número entero válido'
            });
        }
        
        const sanitizedId = sanitizeString(countryId.toString());
        const parsedId = parseInt(sanitizedId);
        
        if (isNaN(parsedId)) {
            return sendErrorResponse(res, 400, {
                reason: 'ID del país debe ser un número válido',
                received: countryId
            });
        }
        
        // Usar executeWithRetry para obtener país con retry automático
        const country = await executeWithRetry(async () => {
            return await getCountryById(parsedId);
        });
        
        if (!country) {
            return sendErrorResponse(res, 404, {
                reason: 'País no encontrado',
                searchedId: parsedId
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'País obtenido correctamente',
            data: {
                country
            }
        });
    } catch (error) {
        logger.error('Error general en countryById:', error);
        
        // Clasificar el error para determinar el código apropiado
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('invalid object name') || message.includes('208')) {
                errorCode = 208;
            } else if (message.includes('invalid column name') || message.includes('207')) {
                errorCode = 207;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'countryById',
            searchedId: req.params.id || req.body.id,
            errorType
        }));
    }
}

export {
    setCountries,
    getCountries,
    countryById
};