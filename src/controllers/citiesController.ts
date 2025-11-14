/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('citiesController');
logger.level = "all";

/* MODELS */
import { CityModelError, createSingleCityFromInput, getAllCities, getCitiesWithCountries, getCitiesByCountry, getCitiesByIsoCountry, getCityByIataCode } from '../models/citiesModel';

/* EXPRESS */
import { Request, Response, NextFunction } from 'express';

/* INTERFACES */
import { ICityInput } from '../interfaces/ICities';

/* VALIDATIONS */
import { validateCityFields, CityValidationData } from '../library/validations';
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

// Función auxiliar para procesar una ciudad individual
const processSingleCity = async (cityData: CityValidationData, index: number) => {
    // Validar campos requeridos
    if (!cityData.iata_codes || !cityData.name_city || !cityData.pais) {
        return {
            error: {
                index,
                city: cityData,
                error: getErrorByCode(400),
                details: 'Campos requeridos: iata_codes, name_city, pais'
            }
        };
    }

    // Validar y sanitizar campos
    const validationResult = validateCityFields(cityData);
    if (!validationResult.isValid) {
        return {
            error: {
                index,
                city: cityData,
                error: getErrorByCode(400),
                details: 'Error en validación de campos',
                validationErrors: validationResult.errors
            }
        };
    }

    const sanitizedCityData = validationResult.sanitizedData!;
    const cityInput: ICityInput = {
        iata_codes: sanitizedCityData.iata_codes,
        name_city: sanitizedCityData.name_city,
        pais: sanitizedCityData.pais
    };
    
    try {
        const createdCity = await executeWithRetry(async () => {
            return await createSingleCityFromInput(cityInput);
        });
        
        return {
            success: {
                index,
                success: true,
                city: createdCity
            }
        };
    } catch (error) {
        // Clasificar el error para determinar el código apropiado
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        let errorDetails = error instanceof Error ? error.message : 'Error desconocido';
        
        // Manejar errores específicos del modelo de ciudad
        if (error instanceof CityModelError) {
            errorCode = error.code;
            errorDetails = error.message;
        }
        // Mapear tipos de error específicos
        else if (error instanceof Error) {
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
            } else if (message.includes('country_not_found') || message.includes('404')) {
                errorCode = 404;
            } else if (message.includes('country not found') || message.includes('país no encontrado')) {
                errorCode = 404;
                errorDetails = `País no encontrado para el código: ${cityData.pais}`;
            }
        }
        
        return {
            error: {
                index,
                city: cityData,
                error: getErrorByCode(errorCode),
                details: errorDetails,
                errorType,
                originalError: error instanceof Error ? error.message : 'Error desconocido'
            }
        };
    }
};

// Función para agregar una o múltiples ciudades
const addCity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const requestData = req.body;
        
        // Determinar si es una ciudad individual o un array de ciudades
        const isArray = Array.isArray(requestData);
        const citiesData: CityValidationData[] = isArray ? requestData : [requestData];
        
        // Validar que hay datos para procesar
        if (!citiesData || citiesData.length === 0) {
            return sendErrorResponse(res, 400, {
                reason: 'Se requiere al menos una ciudad para procesar',
                received: requestData
            });
        }

        // Usar Promise.allSettled para procesamiento paralelo (mejor performance)
        const processResults = await Promise.allSettled(
            citiesData.map((cityData, index) => processSingleCity(cityData, index))
        );

        // Arrays para almacenar resultados y errores
        const results: any[] = [];
        const errors: any[] = [];

        processResults.forEach((result) => {
            if (result.status === 'fulfilled') {
                if (result.value.success) {
                    results.push(result.value.success);
                } else if (result.value.error) {
                    errors.push(result.value.error);
                }
            } else {
                // Promise rechazada
                errors.push({
                    error: getErrorByCode(500),
                    details: result.reason?.message || 'Error desconocido'
                });
            }
        });

        // Preparar respuesta basada en los resultados
        const totalProcessed = results.length + errors.length;
        const successCount = results.length;
        const errorCount = errors.length;

        // Si es una sola ciudad
        if (!isArray) {
            if (results.length > 0) {
                return res.status(201).json({
                    success: true,
                    message: 'Ciudad insertada correctamente',
                    data: {
                        city: results[0].city
                    }
                });
            } else {
                return sendErrorResponse(res, 400, {
                    reason: 'Error insertando ciudad',
                    errorDetails: errors[0]?.error || getErrorByCode(500),
                    validationErrors: errors[0]?.validationErrors
                });
            }
        }

        // Si es un array de ciudades
        const responseStatus = errorCount === 0 ? 201 : (successCount === 0 ? 400 : 207); // 207 = Multi-Status

        return res.status(responseStatus).json({
            success: errorCount === 0,
            message: `Procesadas ${totalProcessed} ciudades: ${successCount} exitosas, ${errorCount} con errores`,
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
        logger.error('Error general en addCity:', error);
        // Usar next() para que el middleware global maneje el error
        return next(createError(500, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'addCity'
        }));
    }
};

const searchAllCities = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cities = await executeWithRetry(async () => {
            return await getAllCities();
        });
        
        if (!cities || cities.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se encontraron ciudades',
                data: {
                    cities: [],
                    total: 0
                }
            });
        }
        
        return res.status(200).json({
            success: true,
            message: `Se encontraron ${cities.length} ciudades`,
            data: {
                cities,
                total: cities.length
            }
        });
    } catch (error) {
        logger.error('Error general en searchAllCities:', error);
        
        // Clasificar el error para determinar el código apropiado
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('invalid object name') || message.includes('208')) {
                errorCode = 208;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'searchAllCities',
            errorType
        }));
    }
};

const searchCitiesWithCountries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cities = await executeWithRetry(async () => {
            return await getCitiesWithCountries();
        });
        
        if (!cities || cities.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se encontraron ciudades',
                data: {
                    cities: [],
                    total: 0
                }
            });
        }
        
        return res.status(200).json({
            success: true,
            message: `Se encontraron ${cities.length} ciudades`,
            data: {
                cities,
                total: cities.length
            }
        });
    } catch (error) {
        logger.error('Error general en searchCitiesWithCountries:', error);
        
        // Clasificar el error para determinar el código apropiado
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('invalid object name') || message.includes('208')) {
                errorCode = 208;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'searchCitiesWithCountries',
            errorType
        }));
    }
};

const searchCitiesByCountry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {country_id} = req.body;
        
        // Validar que country_id existe y es un número válido
        if (!country_id) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de país es requerido',
                field: 'country_id',
                expectedFormat: 'Número entero positivo'
            });
        }
        
        const countryIdNum = parseInt(country_id, 10);
        
        if (isNaN(countryIdNum) || countryIdNum <= 0 || !Number.isInteger(countryIdNum)) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de país inválido',
                field: 'country_id',
                received: country_id,
                expectedFormat: 'Número entero positivo'
            });
        }

        const cities = await executeWithRetry(async () => {
            return await getCitiesByCountry(countryIdNum);
        });
        
        if (!cities || cities.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se encontraron ciudades',
                data: {
                    cities: [],
                    total: 0
                }
            });
        }
        
        return res.status(200).json({
            success: true,
            message: `Se encontraron ${cities.length} ciudades`,
            data: {
                cities,
                total: cities.length
            }
        });
    } catch (error) {
        logger.error('Error general en searchCitiesByCountry:', error);
        
        // Clasificar el error para determinar el código apropiado
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('invalid object name') || message.includes('208')) {
                errorCode = 208;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'searchCitiesByCountry',
            errorType
        }));
    }
};

const searchCitiesByIsoCountry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {iso_country} = req.body;
        
        // Validar que iso_country existe y es válido
        if (!iso_country || typeof iso_country !== 'string') {
            return sendErrorResponse(res, 400, {
                reason: 'Código ISO del país es requerido',
                field: 'iso_country',
                expectedFormat: 'Cadena de 2 caracteres (código ISO)'
            });
        }
        
        const sanitizedIsoCountry = iso_country.trim().toUpperCase();
        
        // Validar formato del código ISO (2 caracteres, solo letras)
        if (sanitizedIsoCountry.length !== 2 || !/^[A-Z]{2}$/.test(sanitizedIsoCountry)) {
            return sendErrorResponse(res, 400, {
                reason: 'Código ISO del país inválido',
                field: 'iso_country',
                received: iso_country,
                expectedFormat: 'Código ISO de 2 letras mayúsculas (ej: ES, US, MX)'
            });
        }
        
        const cities = await executeWithRetry(async () => {
            return await getCitiesByIsoCountry(sanitizedIsoCountry);
        });
        
        if (!cities || cities.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se encontraron ciudades',
                data: {
                    cities: [],
                    total: 0
                }
            });
        }
        
        return res.status(200).json({
            success: true,
            message: `Se encontraron ${cities.length} ciudades`,
            data: {
                cities,
                total: cities.length
            }
        });
    } catch (error) {
        logger.error('Error general en searchCitiesByIsoCountry:', error);
        
        // Clasificar el error para determinar el código apropiado
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('invalid object name') || message.includes('208')) {
                errorCode = 208;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'searchCitiesByIsoCountry',
            errorType
        }));
    }
}

const searchCityByIataCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {iata_code} = req.body;
        
        // Validar que iata_code existe y es válido
        if (!iata_code || typeof iata_code !== 'string') {
            return sendErrorResponse(res, 400, {
                reason: 'Código IATA es requerido',
                field: 'iata_code',
                expectedFormat: 'Cadena de 3 caracteres (código IATA)'
            });
        }
        
        const sanitizedIataCode = iata_code.trim().toUpperCase();
        
        // Validar formato del código IATA (3 caracteres alfanuméricos)
        if (sanitizedIataCode.length < 2 || sanitizedIataCode.length > 5 || !/^[A-Z0-9]{2,5}$/.test(sanitizedIataCode)) {
            return sendErrorResponse(res, 400, {
                reason: 'Código IATA inválido',
                field: 'iata_code',
                received: iata_code,
                expectedFormat: 'Código IATA de 2-5 caracteres alfanuméricos (ej: MAD, NYC, LON)'
            });
        }
        
        const city = await executeWithRetry(async () => {
            return await getCityByIataCode(sanitizedIataCode);
        });
        
        if (!city) {
            return res.status(200).json({
                success: true,
                message: 'No se encontró la ciudad',
                data: null
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Ciudad encontrada',
            data: city
        });
    } catch (error) {
        logger.error('Error general en searchCityByIataCode:', error);
        
        // Clasificar el error para determinar el código apropiado
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('invalid object name') || message.includes('208')) {
                errorCode = 208;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'searchCityByIataCode',
            errorType
        }));
    }
}

export {
    addCity,
    searchAllCities,
    searchCitiesWithCountries,
    searchCitiesByCountry,
    searchCitiesByIsoCountry,
    searchCityByIataCode
};