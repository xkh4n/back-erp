/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('statesModel');
logger.level = "all";

import { prisma } from '../utils/prismaClient';
import { IStates } from '../interfaces/IStates';
import { ICity } from '../interfaces/ICities';
import { executeWithRetry, classifyDatabaseError } from '../middlewares/databaseErrorHandler';
import { getErrorByCode } from '../utils/manageErrors';

// Interfaces adicionales para tipado extendido
export interface StateWithCity extends IStates {
    city: ICity;
}

export interface CreateStateData {
    name_comuna: string;
    cod_territorial: number;
    cod_postal: number;
    cod_sii: number;
    cityId: number;
}

export interface UpdateStateData {
    name_comuna?: string;
    cod_territorial?: number;
    cod_postal?: number;
    cod_sii?: number;
    cityId?: number;
}

export interface IStateWithCityInfo extends IStates {
    city?: {
        id: number;
        name_city: string;
        iata_codes: string;
        countryId: number;
    };
}

// Custom error class para errores específicos del modelo
export class StateModelError extends Error {
    public readonly code: number;
    public readonly type: string;
    public readonly additionalData?: any;

    constructor(code: number, message: string, type: string = 'STATE_MODEL_ERROR', additionalData?: any) {
        super(message);
        this.name = 'StateModelError';
        this.code = code;
        this.type = type;
        this.additionalData = additionalData;
    }
}

// Función auxiliar para crear errores específicos del modelo
const createModelError = (code: number, type: string, additionalData?: any): StateModelError => {
    const errorInfo = getErrorByCode(code);
    return new StateModelError(code, errorInfo.message, type, additionalData);
};

// Validaciones de datos
const validateStateData = (data: CreateStateData): void => {
    if (!data.name_comuna || data.name_comuna.trim().length < 2) {
        throw createModelError(400, 'INVALID_STATE_NAME', {
            field: 'name_comuna',
            received: data.name_comuna,
            expected: 'Nombre de comuna de al menos 2 caracteres'
        });
    }

    if (!data.cod_territorial || !Number.isInteger(data.cod_territorial) || data.cod_territorial <= 0) {
        throw createModelError(400, 'INVALID_COD_TERRITORIAL', {
            field: 'cod_territorial',
            received: data.cod_territorial,
            expected: 'Código territorial válido (número entero positivo)'
        });
    }

    if (!data.cod_postal || !Number.isInteger(data.cod_postal) || data.cod_postal <= 0) {
        throw createModelError(400, 'INVALID_COD_POSTAL', {
            field: 'cod_postal',
            received: data.cod_postal,
            expected: 'Código postal válido (número entero positivo)'
        });
    }

    if (!data.cod_sii || !Number.isInteger(data.cod_sii) || data.cod_sii <= 0) {
        throw createModelError(400, 'INVALID_COD_SII', {
            field: 'cod_sii',
            received: data.cod_sii,
            expected: 'Código SII válido (número entero positivo)'
        });
    }

    if (!data.cityId || !Number.isInteger(data.cityId) || data.cityId <= 0) {
        throw createModelError(400, 'INVALID_CITY_ID', {
            field: 'cityId',
            received: data.cityId,
            expected: 'ID de ciudad válido (número entero positivo)'
        });
    }
};

// === CRUD OPERATIONS ===

const getAllStates = async (): Promise<IStates[]> => {
    try {
        logger.info('Iniciando obtención de todas las comunas...');
        
        const states = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt
                FROM States WITH (NOLOCK)
                ORDER BY name_comuna
            `);
        });
        
        logger.info(`Obtenidas ${states.length} comunas exitosamente`);
        
        if (states.length === 0) {
            logger.warn('No se encontraron comunas en la base de datos');
        }
        
        return states;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching states:", {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof Error) {
            if (error.message.includes('invalid object name') || error.message.includes('208')) {
                throw createModelError(208, 'TABLE_NOT_EXISTS', {
                    table: 'States',
                    operation: 'getAllStates'
                });
            } else if (error.message.includes('timeout')) {
                throw createModelError(504, 'QUERY_TIMEOUT', {
                    operation: 'getAllStates',
                    suggestion: 'Reintente la operación'
                });
            }
        }
        
        throw error;
    }
};

const getStateById = async (id: number): Promise<IStates | null> => {
    try {
        if (!id || id <= 0 || !Number.isInteger(id)) {
            throw createModelError(400, 'INVALID_STATE_ID', {
                received: id,
                expected: 'Número entero positivo'
            });
        }

        const states = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt
                FROM States WITH (NOLOCK)
                WHERE id = ?
            `, id);
        });
        
        return states.length > 0 ? states[0] : null;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching state by ID:", {
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        if (error instanceof Error) {
            if (error.message.includes('invalid object name') || error.message.includes('208')) {
                throw createModelError(208, 'TABLE_NOT_EXISTS', {
                    table: 'States',
                    operation: 'getStateById',
                    searchedId: id
                });
            } else if (error.message.includes('timeout')) {
                throw createModelError(504, 'QUERY_TIMEOUT', {
                    operation: 'getStateById',
                    searchedId: id
                });
            }
        }
        
        throw error;
    }
};

const getStateByName = async (name_comuna: string): Promise<IStates | null> => {
    try {
        if (!name_comuna || name_comuna.trim() === '') {
            throw createModelError(400, 'INVALID_STATE_NAME', {
                received: name_comuna,
                expected: 'Nombre de comuna válido'
            });
        }

        const normalizedName = name_comuna.trim();

        const states = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt
                FROM States WITH (NOLOCK)
                WHERE name_comuna = ?
            `, normalizedName);
        });
        
        return states.length > 0 ? states[0] : null;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error in getStateByName:", {
            name_comuna,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        throw error;
    }
};

const getStateByCodTerritorial = async (cod_territorial: number): Promise<IStates | null> => {
    try {
        if (!cod_territorial || !Number.isInteger(cod_territorial) || cod_territorial <= 0) {
            throw createModelError(400, 'INVALID_COD_TERRITORIAL', {
                received: cod_territorial,
                expected: 'Código territorial válido'
            });
        }

        const states = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt
                FROM States WITH (NOLOCK)
                WHERE cod_territorial = ?
            `, cod_territorial);
        });
        
        return states.length > 0 ? states[0] : null;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error in getStateByCodTerritorial:", {
            cod_territorial,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        throw error;
    }
};

const getStateByCodPostal = async (cod_postal: number): Promise<IStates | null> => {
    try {
        if (!cod_postal || !Number.isInteger(cod_postal) || cod_postal <= 0) {
            throw createModelError(400, 'INVALID_COD_POSTAL', {
                received: cod_postal,
                expected: 'Código postal válido'
            });
        }

        const states = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt
                FROM States WITH (NOLOCK)
                WHERE cod_postal = ?
            `, cod_postal);
        });
        
        return states.length > 0 ? states[0] : null;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error in getStateByCodPostal:", {
            cod_postal,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        throw error;
    }
};

const getStateByCodSii = async (cod_sii: number): Promise<IStates | null> => {
    try {
        if (!cod_sii || !Number.isInteger(cod_sii) || cod_sii <= 0) {
            throw createModelError(400, 'INVALID_COD_SII', {
                received: cod_sii,
                expected: 'Código SII válido'
            });
        }

        const states = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt
                FROM States WITH (NOLOCK)
                WHERE cod_sii = ?
            `, cod_sii);
        });
        
        return states.length > 0 ? states[0] : null;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error in getStateByCodSii:", {
            cod_sii,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        throw error;
    }
};

const getStatesByCity = async (cityId: number): Promise<IStates[]> => {
    try {
        if (!cityId || cityId <= 0 || !Number.isInteger(cityId)) {
            throw createModelError(400, 'INVALID_CITY_ID', {
                received: cityId,
                expected: 'Número entero positivo'
            });
        }

        const states = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt
                FROM States WITH (NOLOCK)
                WHERE cityId = ?
                ORDER BY name_comuna
            `, cityId);
        });
        
        logger.info(`Encontradas ${states.length} comunas para la ciudad ID: ${cityId}`);
        return states;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching states by city:", {
            cityId,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        throw error;
    }
};

const getStatesWithCities = async (): Promise<IStateWithCityInfo[]> => {
    try {
        logger.info('Obteniendo comunas con información de ciudad...');
        
        const statesWithCities = await executeWithRetry(async () => {
            return await prisma.$queryRawUnsafe<any[]>(`
                SELECT 
                    s.id,
                    s.name_comuna,
                    s.cod_territorial,
                    s.cod_postal,
                    s.cod_sii,
                    s.cityId,
                    s.createdAt,
                    s.updatedAt,
                    c.id as city_id,
                    c.name_city,
                    c.iata_codes,
                    c.countryId
                FROM States s WITH (NOLOCK)
                INNER JOIN Cities c WITH (NOLOCK) ON s.cityId = c.id
                ORDER BY s.name_comuna
            `);
        });

        const result: IStateWithCityInfo[] = statesWithCities.map(row => ({
            id: row.id,
            name_comuna: row.name_comuna,
            cod_territorial: row.cod_territorial,
            cod_postal: row.cod_postal,
            cod_sii: row.cod_sii,
            cityId: row.cityId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            city: {
                id: row.city_id,
                name_city: row.name_city,
                iata_codes: row.iata_codes,
                countryId: row.countryId
            }
        }));

        logger.info(`Obtenidas ${result.length} comunas con información de ciudad`);
        return result;
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error fetching states with cities:", {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof Error) {
            if (error.message.includes('invalid object name') || error.message.includes('208')) {
                throw createModelError(208, 'TABLE_NOT_EXISTS', {
                    tables: ['States', 'Cities'],
                    operation: 'getStatesWithCities'
                });
            } else if (error.message.includes('timeout')) {
                throw createModelError(504, 'QUERY_TIMEOUT', {
                    operation: 'getStatesWithCities'
                });
            }
        }
        
        throw error;
    }
};

const createState = async (data: CreateStateData): Promise<IStates> => {
    try {
        validateStateData(data);

        const normalizedData = {
            name_comuna: data.name_comuna.trim(),
            cod_territorial: data.cod_territorial,
            cod_postal: data.cod_postal,
            cod_sii: data.cod_sii,
            cityId: data.cityId
        };

        const result = await executeWithRetry(async () => {
            const now = new Date();
            const insertResult = await prisma.$queryRawUnsafe<IStates[]>(`
                INSERT INTO States (name_comuna, cod_territorial, cod_postal, cod_sii, cityId, createdAt, updatedAt)
                OUTPUT INSERTED.id, INSERTED.name_comuna, INSERTED.cod_territorial, INSERTED.cod_postal, INSERTED.cod_sii, INSERTED.cityId, INSERTED.createdAt, INSERTED.updatedAt
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, normalizedData.name_comuna, normalizedData.cod_territorial, normalizedData.cod_postal, normalizedData.cod_sii, normalizedData.cityId, now, now);
            return insertResult;
        });
        
        if (result.length === 0) {
            throw createModelError(500, 'INSERT_FAILED', {
                operation: 'createState',
                data: normalizedData
            });
        }

        logger.info(`Comuna creada exitosamente: ${result[0].name_comuna} (ID: ${result[0].id})`);
        return result[0];
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error creating state:", {
            data,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('duplicate') || message.includes('2627')) {
                throw createModelError(2627, 'DUPLICATE_STATE', {
                    operation: 'createState',
                    data
                });
            } else if (message.includes('foreign key') || message.includes('547')) {
                throw createModelError(547, 'FOREIGN_KEY_VIOLATION', {
                    operation: 'createState',
                    data,
                    suggestion: 'Verificar que el cityId sea válido'
                });
            } else if (message.includes('string or binary data would be truncated') || message.includes('8152')) {
                throw createModelError(8152, 'DATA_TOO_LONG', {
                    operation: 'createState',
                    data
                });
            } else if (message.includes('timeout')) {
                throw createModelError(504, 'INSERT_TIMEOUT', {
                    operation: 'createState',
                    data
                });
            }
        }
        
        throw error;
    }
};

const updateState = async (id: number, data: UpdateStateData): Promise<IStates | null> => {
    try {
        if (!id || id <= 0 || !Number.isInteger(id)) {
            throw createModelError(400, 'INVALID_STATE_ID', {
                received: id,
                expected: 'Número entero positivo'
            });
        }

        const updateFields = Object.keys(data).filter(key => data[key as keyof UpdateStateData] !== undefined);
        if (updateFields.length === 0) {
            throw createModelError(400, 'NO_UPDATE_FIELDS', {
                received: data,
                expected: 'Al menos un campo para actualizar'
            });
        }

        const setClauses = [];
        const params: any[] = [];

        if (data.name_comuna !== undefined) {
            setClauses.push('name_comuna = ?');
            params.push(data.name_comuna.trim());
        }

        if (data.cod_territorial !== undefined) {
            setClauses.push('cod_territorial = ?');
            params.push(data.cod_territorial);
        }

        if (data.cod_postal !== undefined) {
            setClauses.push('cod_postal = ?');
            params.push(data.cod_postal);
        }

        if (data.cod_sii !== undefined) {
            setClauses.push('cod_sii = ?');
            params.push(data.cod_sii);
        }

        if (data.cityId !== undefined) {
            setClauses.push('cityId = ?');
            params.push(data.cityId);
        }

        setClauses.push('updatedAt = ?');
        params.push(new Date());

        logger.info(`Actualizando comuna con ID: ${id}, campos: [${updateFields.join(', ')}]`);
        
        const result = await executeWithRetry(async () => {
            const updateResult = await prisma.$queryRawUnsafe<IStates[]>(`
                UPDATE States 
                SET ${setClauses.join(', ')}
                OUTPUT INSERTED.id, INSERTED.name_comuna, INSERTED.cod_territorial, INSERTED.cod_postal, INSERTED.cod_sii, INSERTED.cityId, INSERTED.createdAt, INSERTED.updatedAt
                WHERE id = ?
            `, ...params, id);
            return updateResult;
        });

        if (result.length === 0) {
            logger.info(`Comuna no encontrada para actualizar con ID: ${id}`);
            return null;
        }

        logger.info(`Comuna actualizada exitosamente: ${result[0].name_comuna} (ID: ${id})`);
        return result[0];
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error updating state:", {
            id,
            data,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('duplicate') || message.includes('2627')) {
                throw createModelError(2627, 'DUPLICATE_STATE', {
                    operation: 'updateState',
                    id,
                    data
                });
            } else if (message.includes('timeout')) {
                throw createModelError(504, 'UPDATE_TIMEOUT', {
                    operation: 'updateState',
                    id,
                    data
                });
            }
        }
        
        throw error;
    }
};

const deleteState = async (id: number): Promise<boolean> => {
    try {
        if (!id || id <= 0 || !Number.isInteger(id)) {
            throw createModelError(400, 'INVALID_STATE_ID', {
                received: id,
                expected: 'Número entero positivo'
            });
        }

        logger.info(`Eliminando comuna con ID: ${id}`);
        
        const result = await executeWithRetry(async () => {
            const existingState = await prisma.$queryRawUnsafe<IStates[]>(`
                SELECT id, name_comuna FROM States WITH (NOLOCK) WHERE id = ?
            `, id);
            
            if (existingState.length === 0) {
                return { affected: 0, stateName: null };
            }
            
            const stateName = existingState[0].name_comuna;
            
            await prisma.$queryRawUnsafe(`DELETE FROM States WHERE id = ?`, id);
            
            return { 
                affected: 1,
                stateName
            };
        });
        
        if (result.affected > 0) {
            logger.info(`Comuna eliminada exitosamente: ${result.stateName} (ID: ${id})`);
            return true;
        } else {
            logger.info(`Comuna no encontrada para eliminar con ID: ${id}`);
            return false;
        }
    } catch (error) {
        const errorType = classifyDatabaseError(error);
        logger.error("Error deleting state:", {
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof StateModelError) {
            throw error;
        }
        
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            if (message.includes('foreign key') || message.includes('547')) {
                throw createModelError(547, 'FOREIGN_KEY_VIOLATION', {
                    operation: 'deleteState',
                    id,
                    suggestion: 'No se puede eliminar la comuna porque tiene registros asociados'
                });
            } else if (message.includes('timeout')) {
                throw createModelError(504, 'DELETE_TIMEOUT', {
                    operation: 'deleteState',
                    id
                });
            }
        }
        
        throw error;
    }
};

export {
    getAllStates,
    getStateById,
    getStateByName,
    getStateByCodTerritorial,
    getStateByCodPostal,
    getStateByCodSii,
    getStatesByCity,
    getStatesWithCities,
    createState,
    updateState,
    deleteState,
    validateStateData
};
