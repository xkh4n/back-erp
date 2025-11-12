/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('countriesModel');
logger.level = "all";

import { prisma } from '../utils/prismaClient';
// Usar las interfaces existentes (son compatibles con Prisma)
import { ICountry } from '../interfaces/ICountries';
import { ICity } from '../interfaces/ICities';
import { executeWithRetry, classifyDatabaseError } from '../middlewares/databaseErrorHandler';
import { getErrorByCode } from '../utils/manageErrors';

// Interfaces adicionales para tipado extendido
export interface CountryWithCities extends ICountry {
    cities: ICity[];
}

export interface CityWithCountry extends ICity {
    country: ICountry;
}

export interface CreateCountryData {
    iso_code: string;
    name_country: string;
    iata_code: string;
}

export interface UpdateCountryData {
    iso_code?: string;
    name_country?: string;
    iata_code?: string;
}

// Custom error class para errores específicos del modelo
export class CountryModelError extends Error {
    public readonly code: number;
    public readonly type: string;
    public readonly additionalData?: any;

    constructor(code: number, message: string, type: string = 'COUNTRY_MODEL_ERROR', additionalData?: any) {
        super(message);
        this.name = 'CountryModelError';
        this.code = code;
        this.type = type;
        this.additionalData = additionalData;
    }
}

// Función auxiliar para crear errores específicos del modelo
const createModelError = (code: number, type: string, additionalData?: any): CountryModelError => {
    const errorInfo = getErrorByCode(code);
    return new CountryModelError(code, errorInfo.message, type, additionalData);
};

// Validaciones de datos
const validateCountryData = (data: CreateCountryData): void => {
    if (!data.iso_code || data.iso_code.length !== 2) {
        throw createModelError(400, 'INVALID_ISO_CODE', {
            field: 'iso_code',
            received: data.iso_code,
            expected: 'Código ISO de 2 caracteres'
        });
    }

    if (!data.name_country || data.name_country.trim().length < 2) {
        throw createModelError(400, 'INVALID_COUNTRY_NAME', {
            field: 'name_country',
            received: data.name_country,
            expected: 'Nombre de país de al menos 2 caracteres'
        });
    }

    if (!data.iata_code || data.iata_code.length !== 3) {
        throw createModelError(400, 'INVALID_IATA_CODE', {
            field: 'iata_code',
            received: data.iata_code,
            expected: 'Código IATA de 3 caracteres'
        });
    }

    // Validar formato uppercase para códigos
    if (data.iso_code !== data.iso_code.toUpperCase()) {
        throw createModelError(400, 'INVALID_ISO_FORMAT', {
            field: 'iso_code',
            received: data.iso_code,
            expected: 'Código ISO en mayúsculas'
        });
    }

    if (data.iata_code !== data.iata_code.toUpperCase()) {
        throw createModelError(400, 'INVALID_IATA_FORMAT', {
            field: 'iata_code',
            received: data.iata_code,
            expected: 'Código IATA en mayúsculas'
        });
    }
};



// === PAÍSES ===
const getAllCountries = async (): Promise<ICountry[]> => {
    try {
        logger.info('Iniciando obtención de todos los países...');
        
        const countries = await executeWithRetry(async () => {
            const result = await prisma.$queryRaw<ICountry[]>`
                SELECT id, iso_code, name_country, iata_code, createdAt, updatedAt
                FROM Countries
                ORDER BY name_country
            `;
            return result;
        });
        
        logger.info(`Obtenidos ${countries.length} países exitosamente`);
        
        if (countries.length === 0) {
            logger.warn('No se encontraron países en la base de datos');
        }
        
        return countries;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching countries:", {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Crear error más descriptivo según el tipo
        if (error instanceof Error) {
            if (error.message.includes('invalid object name') || error.message.includes('208')) {
                throw createModelError(208, 'TABLE_NOT_EXISTS', {
                    table: 'Countries',
                    operation: 'getAllCountries'
                });
            } else if (error.message.includes('timeout')) {
                throw createModelError(504, 'QUERY_TIMEOUT', {
                    operation: 'getAllCountries',
                    suggestion: 'Reintente la operación'
                });
            }
        }
        
        throw error;
    }
};

const getCountryById = async (id: number): Promise<ICountry | null> => {
    try {
        // Validar que el ID sea válido
        if (!id || id <= 0 || !Number.isInteger(id)) {
            throw createModelError(400, 'INVALID_COUNTRY_ID', {
                received: id,
                expected: 'Número entero positivo'
            });
        }
        const countries = await executeWithRetry(async () => {
            const result = await prisma.$queryRaw<ICountry[]>`
                SELECT id, iso_code, name_country, iata_code, createdAt, updatedAt
                FROM Countries
                WHERE id = ${id}
            `;
            return result;
        });
        
        if (countries.length === 0) {
            return null;
        }
        return countries[0];
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching country by ID:", {
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Si es un error del modelo (validación), re-lanzarlo
        if (error instanceof CountryModelError) {
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
                    operation: 'getCountryById',
                    searchedId: id
                });
            }
        }
        
        throw error;
    }
};

const createCountry = async (data: CreateCountryData): Promise<ICountry> => {
    try {
        // Validar datos de entrada
        validateCountryData(data);

        // Normalizar datos
        const normalizedData = {
            iso_code: data.iso_code.toUpperCase().trim(),
            name_country: data.name_country.trim(),
            iata_code: data.iata_code.toUpperCase().trim()
        };
        const result = await executeWithRetry(async () => {
            const now = new Date();
            const insertResult = await prisma.$queryRaw<ICountry[]>`
                INSERT INTO Countries (iso_code, name_country, iata_code, createdAt, updatedAt)
                OUTPUT INSERTED.id, INSERTED.iso_code, INSERTED.name_country, INSERTED.iata_code, INSERTED.createdAt, INSERTED.updatedAt
                VALUES (${normalizedData.iso_code}, ${normalizedData.name_country}, ${normalizedData.iata_code}, ${now}, ${now})
            `;
            return insertResult;
        });
        
        if (result.length === 0) {
            throw createModelError(500, 'INSERT_FAILED', {
                operation: 'createCountry',
                data: normalizedData
            });
        }
        return result[0];
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error creating country:", {
            data,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Si es un error del modelo (validación), re-lanzarlo
        if (error instanceof CountryModelError) {
            throw error;
        }
        
        // Manejar errores específicos de BD
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('duplicate') || message.includes('2627')) {
                throw createModelError(2627, 'DUPLICATE_COUNTRY', {
                    operation: 'createCountry',
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

const updateCountry = async (id: number, data: UpdateCountryData): Promise<ICountry | null> => {
    try {
        // Validar que el ID sea válido
        if (!id || id <= 0 || !Number.isInteger(id)) {
            throw createModelError(400, 'INVALID_COUNTRY_ID', {
                received: id,
                expected: 'Número entero positivo'
            });
        }

        // Validar que hay datos para actualizar
        const updateFields = Object.keys(data).filter(key => data[key as keyof UpdateCountryData] !== undefined);
        if (updateFields.length === 0) {
            throw createModelError(400, 'NO_UPDATE_FIELDS', {
                received: data,
                expected: 'Al menos un campo para actualizar'
            });
        }

        // Validar campos específicos si están presentes
        if (data.iso_code !== undefined) {
            if (!data.iso_code || data.iso_code.length !== 2) {
                throw createModelError(400, 'INVALID_ISO_CODE', {
                    field: 'iso_code',
                    received: data.iso_code,
                    expected: 'Código ISO de 2 caracteres'
                });
            }
        }

        if (data.iata_code !== undefined) {
            if (!data.iata_code || data.iata_code.length !== 3) {
                throw createModelError(400, 'INVALID_IATA_CODE', {
                    field: 'iata_code',
                    received: data.iata_code,
                    expected: 'Código IATA de 3 caracteres'
                });
            }
        }

        if (data.name_country !== undefined) {
            if (!data.name_country || data.name_country.trim().length < 2) {
                throw createModelError(400, 'INVALID_COUNTRY_NAME', {
                    field: 'name_country',
                    received: data.name_country,
                    expected: 'Nombre de país de al menos 2 caracteres'
                });
            }
        }

        const setClauses = [];
        const params: any[] = [];

        // Normalizar y agregar campos
        if (data.iso_code !== undefined) {
            setClauses.push('iso_code = ?');
            params.push(data.iso_code.toUpperCase().trim());
        }

        if (data.name_country !== undefined) {
            setClauses.push('name_country = ?');
            params.push(data.name_country.trim());
        }

        if (data.iata_code !== undefined) {
            setClauses.push('iata_code = ?');
            params.push(data.iata_code.toUpperCase().trim());
        }

        // Agregar updatedAt automáticamente
        setClauses.push('updatedAt = ?');
        params.push(new Date());

        logger.info(`Actualizando país con ID: ${id}, campos: [${updateFields.join(', ')}]`);
        
        const result = await executeWithRetry(async () => {
            const updateResult = await prisma.$queryRawUnsafe<ICountry[]>(`
                UPDATE Countries 
                SET ${setClauses.join(', ')}
                OUTPUT INSERTED.id, INSERTED.iso_code, INSERTED.name_country, INSERTED.iata_code, INSERTED.createdAt, INSERTED.updatedAt
                WHERE id = ?
            `, ...params, id);
            return updateResult;
        });

        if (result.length === 0) {
            logger.info(`País no encontrado para actualizar con ID: ${id}`);
            return null;
        }

        logger.info(`País actualizado exitosamente: ${result[0].name_country} (ID: ${id})`);
        return result[0];
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error updating country:", {
            id,
            data,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Si es un error del modelo (validación), re-lanzarlo
        if (error instanceof CountryModelError) {
            throw error;
        }
        
        // Manejar errores específicos de BD
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('duplicate') || message.includes('2627')) {
                throw createModelError(2627, 'DUPLICATE_COUNTRY', {
                    operation: 'updateCountry',
                    id,
                    data,
                    conflictingField: message.includes('iso_code') ? 'iso_code' : 
                                     message.includes('iata_code') ? 'iata_code' : 'unknown'
                });
            } else if (message.includes('string or binary data would be truncated') || message.includes('8152')) {
                throw createModelError(8152, 'DATA_TOO_LONG', {
                    operation: 'updateCountry',
                    id,
                    data
                });
            } else if (message.includes('timeout')) {
                throw createModelError(504, 'UPDATE_TIMEOUT', {
                    operation: 'updateCountry',
                    id,
                    data
                });
            }
        }
        
        throw error;
    }
};

const deleteCountry = async (id: number): Promise<boolean> => {
    try {
        // Validar que el ID sea válido
        if (!id || id <= 0 || !Number.isInteger(id)) {
            throw createModelError(400, 'INVALID_COUNTRY_ID', {
                received: id,
                expected: 'Número entero positivo'
            });
        }

        logger.info(`Eliminando país con ID: ${id}`);
        
        const result = await executeWithRetry(async () => {
            // Primero verificar si el país existe
            const existingCountry = await prisma.$queryRaw<ICountry[]>`
                SELECT id, name_country FROM Countries WHERE id = ${id}
            `;
            
            if (existingCountry.length === 0) {
                return { affected: 0, countryName: null };
            }
            
            const countryName = existingCountry[0].name_country;
            
            // Proceder con la eliminación
            const deleteResult = await prisma.$queryRaw<{ affected: number }[]>`
                DELETE FROM Countries WHERE id = ${id}
            `;
            
            return { 
                affected: (deleteResult as any).count || 0,
                countryName
            };
        });
        
        if (result.affected > 0) {
            logger.info(`País eliminado exitosamente: ${result.countryName} (ID: ${id})`);
            return true;
        } else {
            logger.info(`País no encontrado para eliminar con ID: ${id}`);
            return false;
        }
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error deleting country:", {
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Si es un error del modelo (validación), re-lanzarlo
        if (error instanceof CountryModelError) {
            throw error;
        }
        
        // Manejar errores específicos de BD
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('foreign key') || message.includes('547')) {
                throw createModelError(547, 'FOREIGN_KEY_VIOLATION', {
                    operation: 'deleteCountry',
                    id,
                    suggestion: 'No se puede eliminar el país porque tiene ciudades asociadas'
                });
            } else if (message.includes('timeout')) {
                throw createModelError(504, 'DELETE_TIMEOUT', {
                    operation: 'deleteCountry',
                    id
                });
            }
        }
        
        throw error;
    }
};

/*
const getCitiesWithCountry = async (): Promise<CityWithCountry[]> => {
    try {
        logger.info('Obteniendo ciudades con información del país...');
        
        const query = `
            SELECT 
                ci.id,
                ci.name_city,
                ci.iata_codes,
                ci.countryId,
                ci.createdAt as city_createdAt,
                ci.updatedAt as city_updatedAt,
                co.id as country_id,
                co.name_country,
                co.iso_code,
                co.iata_code,
                co.createdAt as country_createdAt,
                co.updatedAt as country_updatedAt
            FROM Cities ci
            INNER JOIN Countries co ON ci.countryId = co.id
            ORDER BY co.name_country, ci.name_city
        `;
        
        const result = await prisma.$queryRawUnsafe<any[]>(query);
        
        const citiesWithCountry: CityWithCountry[] = result.map(row => ({
            id: row.id,
            name_city: row.name_city,
            iata_codes: row.iata_codes,
            countryId: row.countryId,
            createdAt: row.city_createdAt,
            updatedAt: row.city_updatedAt,
            country: {
                id: row.country_id,
                iso_code: row.iso_code,
                name_country: row.name_country,
                iata_code: row.iata_code,
                createdAt: row.country_createdAt,
                updatedAt: row.country_updatedAt
            }
        }));
        
        logger.info(`Obtenidas ${citiesWithCountry.length} ciudades con país`);
        return citiesWithCountry;
    } catch (error) {
        logger.error("Error fetching cities with country:", error);
        throw error;
    }
};
*/
const getCountriesWithCities = async (): Promise<CountryWithCities[]> => {
    try {
        logger.info('Obteniendo países con sus ciudades...');
        
        const result = await executeWithRetry(async () => {
            const queryResult = await prisma.$queryRawUnsafe<any[]>(`
                SELECT 
                    co.id as country_id,
                    co.name_country,
                    co.iso_code,
                    co.iata_code,
                    co.createdAt as country_createdAt,
                    co.updatedAt as country_updatedAt,
                    ci.id as city_id,
                    ci.name_city,
                    ci.iata_codes as city_iata,
                    ci.createdAt as city_createdAt,
                    ci.updatedAt as city_updatedAt
                FROM Countries co
                LEFT JOIN Cities ci ON co.id = ci.countryId
                ORDER BY co.name_country, ci.name_city
            `);
            return queryResult;
        });
        
        // Agrupar por país
        const countriesMap = new Map<number, CountryWithCities>();
        
        result.forEach(row => {
            if (!countriesMap.has(row.country_id)) {
                countriesMap.set(row.country_id, {
                    id: row.country_id,
                    iso_code: row.iso_code,
                    name_country: row.name_country,
                    iata_code: row.iata_code,
                    createdAt: row.country_createdAt,
                    updatedAt: row.country_updatedAt,
                    cities: []
                });
            }
            
            const country = countriesMap.get(row.country_id)!;
            
            if (row.city_id) {
                country.cities.push({
                    id: row.city_id,
                    name_city: row.name_city,
                    iata_codes: row.city_iata,
                    countryId: row.country_id,
                    createdAt: row.city_createdAt,
                    updatedAt: row.city_updatedAt
                });
            }
        });
        
        const countriesWithCities = Array.from(countriesMap.values());
        const totalCities = countriesWithCities.reduce((sum, country) => sum + country.cities.length, 0);
        
        logger.info(`Obtenidos ${countriesWithCities.length} países con ${totalCities} ciudades en total`);
        return countriesWithCities;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching countries with cities:", {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Crear error más descriptivo según el tipo
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('invalid object name') || message.includes('208')) {
                throw createModelError(208, 'TABLE_NOT_EXISTS', {
                    tables: ['Countries', 'Cities'],
                    operation: 'getCountriesWithCities'
                });
            } else if (message.includes('timeout')) {
                throw createModelError(504, 'QUERY_TIMEOUT', {
                    operation: 'getCountriesWithCities',
                    suggestion: 'Esta consulta puede ser lenta con muchos datos'
                });
            }
        }
        
        throw error;
    }
};


const setOnlyCountry = async (countryData: CreateCountryData): Promise<ICountry> => {
    try {
        // Validar datos de entrada
        validateCountryData(countryData);

        // Normalizar datos para búsqueda
        const normalizedData = {
            iso_code: countryData.iso_code.toUpperCase().trim(),
            name_country: countryData.name_country.trim(),
            iata_code: countryData.iata_code.toUpperCase().trim()
        };

        logger.info(`Verificando si existe país: ${normalizedData.name_country} (${normalizedData.iso_code}/${normalizedData.iata_code})`);
        
        // Verificar si el país ya existe
        const existingCountry = await executeWithRetry(async () => {
            const result = await prisma.$queryRaw<ICountry[]>`
                SELECT id, iso_code, name_country, iata_code, createdAt, updatedAt
                FROM Countries
                WHERE iso_code = ${normalizedData.iso_code} OR iata_code = ${normalizedData.iata_code}
            `;
            return result;
        });
        
        if (existingCountry.length > 0) {
            const existing = existingCountry[0];
            logger.info(`País ya existe: ${existing.name_country} (ID: ${existing.id})`);
            
            // Verificar si los datos son exactamente iguales
            const isExactMatch = existing.iso_code === normalizedData.iso_code && 
                                existing.iata_code === normalizedData.iata_code &&
                                existing.name_country === normalizedData.name_country;
            
            if (!isExactMatch) {
                logger.warn(`Conflicto de datos detectado:`, {
                    existing: {
                        iso_code: existing.iso_code,
                        name_country: existing.name_country,
                        iata_code: existing.iata_code
                    },
                    provided: normalizedData
                });
                
                throw createModelError(2627, 'COUNTRY_CONFLICT', {
                    existing: existing,
                    provided: normalizedData,
                    message: 'País con código ISO o IATA similar ya existe pero con datos diferentes'
                });
            }
            
            return existing;
        }
        
        // Crear el país si no existe
        logger.info(`Creando nuevo país: ${normalizedData.name_country}`);
        return await createCountry(normalizedData);
        
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error in setOnlyCountry:", {
            countryData,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        // Si es un error del modelo, re-lanzarlo
        if (error instanceof CountryModelError) {
            throw error;
        }
        
        throw error;
    }
};

// === EXPORTS ===
export { 
    getAllCountries, 
    getCountryById,
    createCountry,
    updateCountry,
    deleteCountry,
    getCountriesWithCities,
    setOnlyCountry,
    createModelError,
    validateCountryData
};