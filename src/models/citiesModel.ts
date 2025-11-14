/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('citiesModel');
logger.level = "all";

/* PRISMA */
import { prisma } from '../utils/prismaClient';

import { ICountry } from '../interfaces/ICountries';
import { ICity, ICityInput, ICityWithCountryInfo } from '../interfaces/ICities';
import { executeWithRetry, classifyDatabaseError } from '../middlewares/databaseErrorHandler';
import { getErrorByCode } from '../utils/manageErrors';
import { getCountryByIataCode } from './countriesModel';

export interface CityWithCountry extends ICity {
    country: ICountry;
}

export interface CreateCityData{
    name_city: string;
    iata_codes: string;
    countryId: number;
}

export interface CreateMultipleCitiesResult {
    success: ICityWithCountryInfo[];
    errors: {
        input: ICityInput;
        error: string;
        code?: number;
    }[];
    summary: {
        total: number;
        successful: number;
        failed: number;
    };
}

// Custom error class para errores específicos del modelo
export class CityModelError extends Error {
    public readonly code: number;
    public readonly type: string;
    public readonly additionalData?: any;

    constructor(code: number, message: string, type: string = 'CITY_MODEL_ERROR', additionalData?: any) {
        super(message);
        this.name = 'CityModelError';
        this.code = code;
        this.type = type;
        this.additionalData = additionalData;
    }
}

// Función auxiliar para crear errores específicos del modelo
const createModelError = (code: number, type: string, additionalData?: any): CityModelError => {
    const errorInfo = getErrorByCode(code);
    return new CityModelError(code, errorInfo.message, type, additionalData);
};

const validateCityData = (data: CreateCityData) => {
    if (!data.name_city || data.name_city.trim() === '') {
        throw createModelError(400, 'INVALID_CITY_NAME', {
            field: 'name_city',
            received: data.name_city,
            expected: 'Nombre de ciudad de al menos 2 caracteres'
        });
    }
    if (!data.iata_codes || data.iata_codes.trim() === '') {
        throw createModelError(400, 'INVALID_IATA_CODES', {
            field: 'iata_codes',
            received: data.iata_codes,
            expected: 'Código IATA de al menos 2 caracteres'
        });
    }
    if (!data.countryId || typeof data.countryId !== 'number') {
        throw createModelError(400, 'INVALID_COUNTRY_ID', {
            field: 'countryId',
            received: data.countryId,
            expected: 'ID de país válido (número)'
        });
    }
};

const createCity = async (data: CreateCityData): Promise<ICity> => {
    try {
        validateCityData(data);

        const normalizedData = {
            name_city: data.name_city.trim(),
            iata_codes: data.iata_codes.trim().toUpperCase(),
            countryId: data.countryId
        };
        const result = await executeWithRetry(async () => {
            const now = new Date();
            const insertResult = await prisma.$queryRawUnsafe<ICity[]>(`
                INSERT INTO Cities (name_city, iata_codes, countryId, createdAt, updatedAt)
                OUTPUT INSERTED.id, INSERTED.name_city, INSERTED.iata_codes, INSERTED.countryId, INSERTED.createdAt, INSERTED.updatedAt
                VALUES (?, ?, ?, ?, ?)
            `, normalizedData.name_city, normalizedData.iata_codes, normalizedData.countryId, now, now);
            return insertResult;
        });
        if (result.length === 0) {
            throw createModelError(500, 'INSERT_FAILED', {
                operation: 'createCity',
                data: normalizedData
            });
        }
        return result[0];
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        
        // Si es un error del modelo (validación), re-lanzarlo
        if (error instanceof CityModelError) {
            throw error;
        }
        
        // Manejar errores específicos de BD
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('duplicate') || message.includes('2627')) {
                throw createModelError(2627, 'DUPLICATE_CITY', {
                    operation: 'createCity',
                    data,
                    conflictingField: message.includes('iso_code') ? 'iso_code' : 
                                        message.includes('iata_code') ? 'iata_code' : 'unknown'
                });
            } else if (message.includes('foreign key') || message.includes('547')) {
                throw createModelError(547, 'FOREIGN_KEY_VIOLATION', {
                    operation: 'createCountry',
                    data
                });
            } else if (message.includes('string or binary data would be truncated') || message.includes('8152')) {
                throw createModelError(8152, 'DATA_TOO_LONG', {
                    operation: 'createCountry',
                    data,
                    suggestion: 'Verificar longitud de los campos'
                });
            } else if (message.includes('timeout')) {
                throw createModelError(504, 'INSERT_TIMEOUT', {
                    operation: 'createCountry',
                    data
                });
            }
        }
        
        throw error;
    }
};

// Función para crear una ciudad desde el input del frontend
const createSingleCityFromInput = async (cityInput: ICityInput): Promise<ICityWithCountryInfo> => {
    try {
        // Validación simplificada - dejar que validateCityData haga el trabajo pesado
        if (!cityInput.pais || cityInput.pais.trim() === '') {
            throw createModelError(400, 'INVALID_COUNTRY_CODE', {
                field: 'pais',
                received: cityInput.pais,
                expected: 'Código IATA del país válido'
            });
        }

        // Buscar el país por su código IATA (con retry incorporado)
        const country = await getCountryByIataCode(cityInput.pais);
        
        if (!country) {
            throw createModelError(404, 'COUNTRY_NOT_FOUND', {
                field: 'pais',
                received: cityInput.pais,
                suggestion: 'Verificar que el código IATA del país sea correcto'
            });
        }

        // Crear la ciudad (validación interna en createCity)
        const cityData: CreateCityData = {
            name_city: cityInput.name_city.trim(),
            iata_codes: cityInput.iata_codes.trim().toUpperCase(),
            countryId: country.id
        };

        const createdCity = await createCity(cityData);
        
        // Retornar la ciudad con información del país
        const cityWithCountryInfo: ICityWithCountryInfo = {
            ...createdCity,
            country: {
                id: country.id,
                name_country: country.name_country,
                iso_code: country.iso_code,
                iata_code: country.iata_code
            }
        };

        logger.info(`Ciudad creada exitosamente: ${createdCity.name_city} (ID: ${createdCity.id})`);
        return cityWithCountryInfo;
        
    } catch (error) {
        logger.error("Error creating city from input:", {
            input: cityInput,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        throw error;
    }
};

// Función para crear múltiples ciudades
const createMultipleCities = async (citiesInput: ICityInput[]): Promise<CreateMultipleCitiesResult> => {
    logger.info(`Iniciando creación de ${citiesInput.length} ciudades...`);
    
    const result: CreateMultipleCitiesResult = {
        success: [],
        errors: [],
        summary: {
            total: citiesInput.length,
            successful: 0,
            failed: 0
        }
    };

    for (let i = 0; i < citiesInput.length; i++) {
        const cityInput = citiesInput[i];
        
        try {
            logger.info(`Procesando ciudad ${i + 1}/${citiesInput.length}: ${cityInput.name_city}`);
            
            const createdCity = await createSingleCityFromInput(cityInput);
            result.success.push(createdCity);
            result.summary.successful++;
            
            logger.info(`✓ Ciudad ${i + 1} creada: ${createdCity.name_city}`);
            
        } catch (error) {
            result.summary.failed++;
            
            let errorMessage = 'Error desconocido';
            let errorCode: number | undefined;
            
            if (error instanceof CityModelError) {
                errorMessage = error.message;
                errorCode = error.code;
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            
            result.errors.push({
                input: cityInput,
                error: errorMessage,
                code: errorCode
            });
            
            logger.warn(`✗ Error en ciudad ${i + 1} (${cityInput.name_city}): ${errorMessage}`);
        }
    }

    logger.info(`Proceso completado: ${result.summary.successful} exitosas, ${result.summary.failed} fallidas`);
    return result;
};

const getAllCities = async (): Promise<ICity[]> => {
    try{
        const cities = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<ICity[]>(`
                SELECT id, name_city, iata_codes, countryId, createdAt, updatedAt
                FROM Cities  WITH (NOLOCK)
                ORDER BY name_city asc
            `);
        });
        if(cities.length === 0){
            logger.warn('No se encontraron ciudades en la base de datos');
        }
        return cities;
    } catch (error) {
            const errorType = classifyDatabaseError(error);
            logger.error("Error fetching cities:", {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType,
                timestamp: new Date().toISOString()
            });
            
            // Crear error más descriptivo según el tipo
            if (error instanceof Error) {
                if (error.message.includes('invalid object name') || error.message.includes('208')) {
                    throw createModelError(208, 'TABLE_NOT_EXISTS', {
                        table: 'Cities',
                        operation: 'getAllCities'
                    });
                } else if (error.message.includes('timeout')) {
                    throw createModelError(504, 'QUERY_TIMEOUT', {
                        operation: 'getAllCities',
                        suggestion: 'Reintente la operación'
                    });
                }
            }
            
            throw error;
        }
}

const getCitiesWithCountries = async (): Promise<ICityWithCountryInfo[]> => {
    try {
        const citiesWithCountries = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<ICityWithCountryInfo[]>(`
                SELECT 
                    c.id, c.name_city, c.iata_codes, c.countryId, c.createdAt, c.updatedAt,
                    co.id AS country_id, co.iso_code AS country_iso_code, co.name_country AS country_name_country, co.iata_code AS country_iata_code
                FROM Cities c WITH (NOLOCK)
                JOIN Countries co WITH (NOLOCK) ON c.countryId = co.id
                ORDER BY c.name_city asc
            `);
        });

        if (citiesWithCountries.length === 0) {
            logger.warn('No se encontraron ciudades con información de países en la base de datos');
        }
        return citiesWithCountries;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching cities with countries:", {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Crear error más descriptivo según el tipo
        if (error instanceof Error) {
            if (error.message.includes('invalid object name') || error.message.includes('208')) {
                throw createModelError(208, 'TABLE_NOT_EXISTS', {
                    table: 'Cities',
                    operation: 'getCitiesWithCountries'
                });
            } else if (error.message.includes('timeout')) {
                throw createModelError(504, 'QUERY_TIMEOUT', {
                    operation: 'getCitiesWithCountries',
                    suggestion: 'Reintente la operación'
                });
            }
        }
        
        throw error;
    }
};

const getCitiesByCountry = async (id: number): Promise<ICity[]> => {
    try {
        if (!id || id <= 0 || !Number.isInteger(id)) {
            throw createModelError(400, 'INVALID_COUNTRY_ID', {
                received: id,
                expected: 'Número entero positivo'
            });
        }
        const cities = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<ICity[]>(`
                SELECT id, name_city, iata_codes, countryId, createdAt, updatedAt
                FROM Cities WITH (NOLOCK)
                WHERE countryId = ?
            `, id);
        });
        return cities;
    } catch (error) {
            const errorType = classifyDatabaseError(error);
            logger.error("Error fetching country by ID:", {
                id,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType,
                timestamp: new Date().toISOString()
            });
            
            // Si es un error del modelo (validación), re-lanzarlo
            if (error instanceof CityModelError) {
                throw error;
            }
            
            // Para otros errores de BD, crear error descriptivo
            if (error instanceof Error) {
                if (error.message.includes('invalid object name') || error.message.includes('208')) {
                    throw createModelError(208, 'TABLE_NOT_EXISTS', {
                        table: 'Countries',
                        operation: 'getCountryById',
                        searchedId: id
                    });
                } else if (error.message.includes('timeout')) {
                    throw createModelError(504, 'QUERY_TIMEOUT', {
                        operation: 'getCitiesByCountry',
                        searchedId: id
                    });
                }
            }
            
            throw error;
        }
}

const getCitiesByIsoCountry = async (iso_code: string): Promise<ICity[]> => {
    try {
        if (!iso_code || typeof iso_code !== 'string' || iso_code.trim() === '') {
            throw createModelError(400, 'INVALID_ISO_CODE', {
                received: iso_code,
                expected: 'Código ISO válido (cadena no vacía)'
            });
        }
        const cities = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<ICity[]>(`
                SELECT c.id, c.name_city, c.iata_codes, c.countryId, c.createdAt, c.updatedAt
                FROM Cities c WITH (NOLOCK)
                JOIN Countries co WITH (NOLOCK) ON c.countryId = co.id
                WHERE co.iso_code = ?
            `, iso_code.trim().toUpperCase());
        });
        return cities;
    } catch (error) {
            const errorType = classifyDatabaseError(error);
            logger.error("Error fetching cities by ISO country code:", {
                iso_code,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType,
                timestamp: new Date().toISOString()
            });
            // Si es un error del modelo (validación), re-lanzarlo
            if (error instanceof CityModelError) {
                throw error;
            }
            // Para otros errores de BD, crear error descriptivo
            if (error instanceof Error) {
                if (error.message.includes('invalid object name') || error.message.includes('208')) {
                    throw createModelError(208, 'TABLE_NOT_EXISTS', {
                        table: 'Cities',
                        operation: 'getCitiesByIsoCountry',
                        searchedIso: iso_code
                    });
                } else if (error.message.includes('timeout')) {
                    throw createModelError(504, 'QUERY_TIMEOUT', {
                        operation: 'getCitiesByIsoCountry',
                        searchedIso: iso_code
                    });
                }
            }
            throw error;
        }
}

const getCityByIataCode = async (iata_code: string): Promise<ICity | null> => {
    try {
        if (!iata_code || typeof iata_code !== 'string' || iata_code.trim() === '') {
            throw createModelError(400, 'INVALID_IATA_CODE', {
                received: iata_code,
                expected: 'Código IATA válido (cadena no vacía)'
            });
        }
        const city = await executeWithRetry(async () => {
            const result = await prisma.$queryRawUnsafe<ICity[]>(`
                SELECT id, name_city, iata_codes, countryId, createdAt, updatedAt
                FROM Cities WITH (NOLOCK)
                WHERE iata_codes = ?
            `, iata_code.trim().toUpperCase());
            return result;
        });
        return city.length > 0 ? city[0] : null;
    } catch (error) {
            const errorType = classifyDatabaseError(error);
            logger.error("Error fetching city by IATA code:", {
                iata_code,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType,
                timestamp: new Date().toISOString()
            });
            // Si es un error del modelo (validación), re-lanzarlo
            if (error instanceof CityModelError) {
                throw error;
            }
            // Para otros errores de BD, crear error descriptivo
            if (error instanceof Error) {
                if (error.message.includes('invalid object name') || error.message.includes('208')) {
                    throw createModelError(208, 'TABLE_NOT_EXISTS', {
                        table: 'Cities',
                        operation: 'getCityByIataCode',
                        searchedIata: iata_code
                    });
                } else if (error.message.includes('timeout')) {
                    throw createModelError(504, 'QUERY_TIMEOUT', {
                        operation: 'getCityByIataCode',
                        searchedIata: iata_code
                    });
                }
            }
            throw error;
        }
}

export {
    createCity,
    createSingleCityFromInput,
    createMultipleCities,
    getAllCities,
    getCitiesWithCountries,
    getCitiesByCountry,
    getCitiesByIsoCountry,
    getCityByIataCode
};