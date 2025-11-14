/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('statesController');
logger.level = "all";

/* MODELS */
import { 
    StateModelError,
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
    CreateStateData,
    UpdateStateData
} from '../models/statesModel';

/* EXPRESS */
import { Request, Response, NextFunction } from 'express';

/* VALIDATIONS */
import { sanitizeString } from '../library/validations';
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
    
    if (additionalData) {
        response.additionalInfo = additionalData;
    }
    
    return res.status(errorCode).json(response);
};

// Función auxiliar para validar y sanitizar datos de comuna
const validateAndSanitizeStateData = (data: any): { isValid: boolean; errors: string[]; sanitizedData?: CreateStateData } => {
    const errors: string[] = [];
    
    if (!data) {
        errors.push('Los datos de la comuna son requeridos');
        return { isValid: false, errors };
    }

    // Validar name_comuna
    if (!data.name_comuna || typeof data.name_comuna !== 'string') {
        errors.push('El nombre de la comuna es requerido y debe ser una cadena de texto');
    } else {
        const sanitizedName = sanitizeString(data.name_comuna);
        if (sanitizedName.length < 2 || sanitizedName.length > 100) {
            errors.push('El nombre de la comuna debe tener entre 2 y 100 caracteres');
        }
    }

    // Validar cod_territorial
    if (data.cod_territorial === undefined || data.cod_territorial === null) {
        errors.push('El código territorial es requerido');
    } else {
        const codTerritorial = parseInt(data.cod_territorial, 10);
        if (isNaN(codTerritorial) || codTerritorial <= 0 || !Number.isInteger(codTerritorial)) {
            errors.push('El código territorial debe ser un número entero positivo');
        }
    }

    // Validar cod_postal
    if (data.cod_postal === undefined || data.cod_postal === null) {
        errors.push('El código postal es requerido');
    } else {
        const codPostal = parseInt(data.cod_postal, 10);
        if (isNaN(codPostal) || codPostal <= 0 || !Number.isInteger(codPostal)) {
            errors.push('El código postal debe ser un número entero positivo');
        }
    }

    // Validar cod_sii
    if (data.cod_sii === undefined || data.cod_sii === null) {
        errors.push('El código SII es requerido');
    } else {
        const codSii = parseInt(data.cod_sii, 10);
        if (isNaN(codSii) || codSii <= 0 || !Number.isInteger(codSii)) {
            errors.push('El código SII debe ser un número entero positivo');
        }
    }

    // Validar cityId
    if (data.cityId === undefined || data.cityId === null) {
        errors.push('El ID de la ciudad es requerido');
    } else {
        const cityId = parseInt(data.cityId, 10);
        if (isNaN(cityId) || cityId <= 0 || !Number.isInteger(cityId)) {
            errors.push('El ID de la ciudad debe ser un número entero positivo');
        }
    }

    if (errors.length === 0) {
        const sanitizedData: CreateStateData = {
            name_comuna: sanitizeString(data.name_comuna),
            cod_territorial: parseInt(data.cod_territorial, 10),
            cod_postal: parseInt(data.cod_postal, 10),
            cod_sii: parseInt(data.cod_sii, 10),
            cityId: parseInt(data.cityId, 10)
        };

        return {
            isValid: true,
            errors: [],
            sanitizedData
        };
    }

    return {
        isValid: false,
        errors
    };
};

// GET - Obtener todas las comunas
const searchAllStates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const states = await executeWithRetry(async () => {
            return await getAllStates();
        });
        
        if (!states || states.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se encontraron comunas',
                data: {
                    states: [],
                    total: 0
                }
            });
        }
        
        return res.status(200).json({
            success: true,
            message: `Se encontraron ${states.length} comunas`,
            data: {
                states,
                total: states.length
            }
        });
    } catch (error) {
        logger.error('Error general en searchAllStates:', error);
        
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
            operation: 'searchAllStates',
            errorType
        }));
    }
};

// GET - Obtener comuna por ID
const searchStateById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de comuna es requerido',
                field: 'id',
                expectedFormat: 'Número entero positivo'
            });
        }
        
        const stateId = parseInt(id, 10);
        
        if (isNaN(stateId) || stateId <= 0 || !Number.isInteger(stateId)) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de comuna inválido',
                field: 'id',
                received: id,
                expectedFormat: 'Número entero positivo'
            });
        }

        const state = await executeWithRetry(async () => {
            return await getStateById(stateId);
        });
        
        if (!state) {
            return sendErrorResponse(res, 404, {
                reason: 'Comuna no encontrada',
                searchedId: stateId
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Comuna encontrada',
            data: {
                state
            }
        });
    } catch (error) {
        logger.error('Error general en searchStateById:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
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
            operation: 'searchStateById',
            errorType
        }));
    }
};

// GET - Obtener comuna por nombre
const searchStateByName = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name_comuna } = req.body;
        
        if (!name_comuna || typeof name_comuna !== 'string') {
            return sendErrorResponse(res, 400, {
                reason: 'Nombre de comuna es requerido',
                field: 'name_comuna',
                expectedFormat: 'Cadena de texto no vacía'
            });
        }
        
        const sanitizedName = sanitizeString(name_comuna);
        
        if (sanitizedName.length < 2) {
            return sendErrorResponse(res, 400, {
                reason: 'Nombre de comuna inválido',
                field: 'name_comuna',
                received: name_comuna,
                expectedFormat: 'Al menos 2 caracteres'
            });
        }

        const state = await executeWithRetry(async () => {
            return await getStateByName(sanitizedName);
        });
        
        if (!state) {
            return sendErrorResponse(res, 404, {
                reason: 'Comuna no encontrada',
                searchedName: sanitizedName
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Comuna encontrada',
            data: {
                state
            }
        });
    } catch (error) {
        logger.error('Error general en searchStateByName:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
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
            operation: 'searchStateByName',
            errorType
        }));
    }
};

// GET - Obtener comuna por código territorial
const searchStateByCodTerritorial = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cod_territorial } = req.body;
        
        if (!cod_territorial) {
            return sendErrorResponse(res, 400, {
                reason: 'Código territorial es requerido',
                field: 'cod_territorial',
                expectedFormat: 'Número entero positivo'
            });
        }
        
        const codTerritorial = parseInt(cod_territorial, 10);
        
        if (isNaN(codTerritorial) || codTerritorial <= 0 || !Number.isInteger(codTerritorial)) {
            return sendErrorResponse(res, 400, {
                reason: 'Código territorial inválido',
                field: 'cod_territorial',
                received: cod_territorial,
                expectedFormat: 'Número entero positivo'
            });
        }

        const state = await executeWithRetry(async () => {
            return await getStateByCodTerritorial(codTerritorial);
        });
        
        if (!state) {
            return sendErrorResponse(res, 404, {
                reason: 'Comuna no encontrada',
                searchedCodTerritorial: codTerritorial
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Comuna encontrada',
            data: {
                state
            }
        });
    } catch (error) {
        logger.error('Error general en searchStateByCodTerritorial:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
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
            operation: 'searchStateByCodTerritorial',
            errorType
        }));
    }
};

// GET - Obtener comuna por código postal
const searchStateByCodPostal = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cod_postal } = req.body;
        
        if (!cod_postal) {
            return sendErrorResponse(res, 400, {
                reason: 'Código postal es requerido',
                field: 'cod_postal',
                expectedFormat: 'Número entero positivo'
            });
        }
        
        const codPostal = parseInt(cod_postal, 10);
        
        if (isNaN(codPostal) || codPostal <= 0 || !Number.isInteger(codPostal)) {
            return sendErrorResponse(res, 400, {
                reason: 'Código postal inválido',
                field: 'cod_postal',
                received: cod_postal,
                expectedFormat: 'Número entero positivo'
            });
        }

        const state = await executeWithRetry(async () => {
            return await getStateByCodPostal(codPostal);
        });
        
        if (!state) {
            return sendErrorResponse(res, 404, {
                reason: 'Comuna no encontrada',
                searchedCodPostal: codPostal
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Comuna encontrada',
            data: {
                state
            }
        });
    } catch (error) {
        logger.error('Error general en searchStateByCodPostal:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
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
            operation: 'searchStateByCodPostal',
            errorType
        }));
    }
};

// GET - Obtener comuna por código SII
const searchStateByCodSii = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cod_sii } = req.body;
        
        if (!cod_sii) {
            return sendErrorResponse(res, 400, {
                reason: 'Código SII es requerido',
                field: 'cod_sii',
                expectedFormat: 'Número entero positivo'
            });
        }
        
        const codSii = parseInt(cod_sii, 10);
        
        if (isNaN(codSii) || codSii <= 0 || !Number.isInteger(codSii)) {
            return sendErrorResponse(res, 400, {
                reason: 'Código SII inválido',
                field: 'cod_sii',
                received: cod_sii,
                expectedFormat: 'Número entero positivo'
            });
        }

        const state = await executeWithRetry(async () => {
            return await getStateByCodSii(codSii);
        });
        
        if (!state) {
            return sendErrorResponse(res, 404, {
                reason: 'Comuna no encontrada',
                searchedCodSii: codSii
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Comuna encontrada',
            data: {
                state
            }
        });
    } catch (error) {
        logger.error('Error general en searchStateByCodSii:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
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
            operation: 'searchStateByCodSii',
            errorType
        }));
    }
};

// GET - Obtener comunas por ciudad
const searchStatesByCity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cityId } = req.body;
        
        if (!cityId) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de ciudad es requerido',
                field: 'cityId',
                expectedFormat: 'Número entero positivo'
            });
        }
        
        const cityIdNum = parseInt(cityId, 10);
        
        if (isNaN(cityIdNum) || cityIdNum <= 0 || !Number.isInteger(cityIdNum)) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de ciudad inválido',
                field: 'cityId',
                received: cityId,
                expectedFormat: 'Número entero positivo'
            });
        }

        const states = await executeWithRetry(async () => {
            return await getStatesByCity(cityIdNum);
        });
        
        if (!states || states.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se encontraron comunas para esta ciudad',
                data: {
                    states: [],
                    total: 0,
                    cityId: cityIdNum
                }
            });
        }
        
        return res.status(200).json({
            success: true,
            message: `Se encontraron ${states.length} comunas`,
            data: {
                states,
                total: states.length,
                cityId: cityIdNum
            }
        });
    } catch (error) {
        logger.error('Error general en searchStatesByCity:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
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
            operation: 'searchStatesByCity',
            errorType
        }));
    }
};

// GET - Obtener comunas con información de ciudades
const searchStatesWithCities = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const states = await executeWithRetry(async () => {
            return await getStatesWithCities();
        });
        
        if (!states || states.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se encontraron comunas',
                data: {
                    states: [],
                    total: 0
                }
            });
        }
        
        return res.status(200).json({
            success: true,
            message: `Se encontraron ${states.length} comunas`,
            data: {
                states,
                total: states.length
            }
        });
    } catch (error) {
        logger.error('Error general en searchStatesWithCities:', error);
        
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
            operation: 'searchStatesWithCities',
            errorType
        }));
    }
};

// POST - Crear nueva comuna
const addState = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const requestData = req.body;
        
        // Validar y sanitizar datos
        const validationResult = validateAndSanitizeStateData(requestData);
        
        if (!validationResult.isValid) {
            return sendErrorResponse(res, 400, {
                reason: 'Error en validación de campos',
                validationErrors: validationResult.errors
            });
        }

        const state = await executeWithRetry(async () => {
            return await createState(validationResult.sanitizedData!);
        });
        
        return res.status(201).json({
            success: true,
            message: 'Comuna creada correctamente',
            data: {
                state
            }
        });
    } catch (error) {
        logger.error('Error general en addState:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        let errorDetails = error instanceof Error ? error.message : 'Error desconocido';
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
            errorDetails = error.message;
        } else if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('duplicate') || message.includes('2627')) {
                errorCode = 2627;
            } else if (message.includes('foreign key') || message.includes('547')) {
                errorCode = 547;
                errorDetails = 'Ciudad no encontrada. Verificar que el cityId sea válido';
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: errorDetails,
            timestamp: new Date().toISOString(),
            operation: 'addState',
            errorType
        }));
    }
};

// PUT - Actualizar comuna
const modifyState = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id, ...updateData } = req.body;
        
        if (!id) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de comuna es requerido',
                field: 'id'
            });
        }
        
        const stateId = parseInt(id, 10);
        
        if (isNaN(stateId) || stateId <= 0 || !Number.isInteger(stateId)) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de comuna inválido',
                field: 'id',
                received: id
            });
        }

        // Sanitizar campos de actualización
        const sanitizedUpdateData: UpdateStateData = {};
        
        if (updateData.name_comuna !== undefined) {
            sanitizedUpdateData.name_comuna = sanitizeString(updateData.name_comuna);
        }
        
        if (updateData.cod_territorial !== undefined) {
            sanitizedUpdateData.cod_territorial = parseInt(updateData.cod_territorial, 10);
        }
        
        if (updateData.cod_postal !== undefined) {
            sanitizedUpdateData.cod_postal = parseInt(updateData.cod_postal, 10);
        }
        
        if (updateData.cod_sii !== undefined) {
            sanitizedUpdateData.cod_sii = parseInt(updateData.cod_sii, 10);
        }
        
        if (updateData.cityId !== undefined) {
            sanitizedUpdateData.cityId = parseInt(updateData.cityId, 10);
        }

        const state = await executeWithRetry(async () => {
            return await updateState(stateId, sanitizedUpdateData);
        });
        
        if (!state) {
            return sendErrorResponse(res, 404, {
                reason: 'Comuna no encontrada',
                searchedId: stateId
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Comuna actualizada correctamente',
            data: {
                state
            }
        });
    } catch (error) {
        logger.error('Error general en modifyState:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('duplicate') || message.includes('2627')) {
                errorCode = 2627;
            } else if (message.includes('foreign key') || message.includes('547')) {
                errorCode = 547;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'modifyState',
            errorType
        }));
    }
};

// DELETE - Eliminar comuna
const removeState = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de comuna es requerido',
                field: 'id'
            });
        }
        
        const stateId = parseInt(id, 10);
        
        if (isNaN(stateId) || stateId <= 0 || !Number.isInteger(stateId)) {
            return sendErrorResponse(res, 400, {
                reason: 'ID de comuna inválido',
                field: 'id',
                received: id
            });
        }

        const deleted = await executeWithRetry(async () => {
            return await deleteState(stateId);
        });
        
        if (!deleted) {
            return sendErrorResponse(res, 404, {
                reason: 'Comuna no encontrada',
                searchedId: stateId
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Comuna eliminada correctamente',
            data: {
                deletedId: stateId
            }
        });
    } catch (error) {
        logger.error('Error general en removeState:', error);
        
        const errorType = classifyDatabaseError(error);
        let errorCode = 500;
        
        if (error instanceof StateModelError) {
            errorCode = error.code;
        } else if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('foreign key') || message.includes('547')) {
                errorCode = 547;
            } else if (message.includes('connection') || message.includes('econnrefused')) {
                errorCode = 503;
            } else if (message.includes('timeout')) {
                errorCode = 504;
            }
        }
        
        return next(createError(errorCode, {
            details: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString(),
            operation: 'removeState',
            errorType
        }));
    }
};

export {
    searchAllStates,
    searchStateById,
    searchStateByName,
    searchStateByCodTerritorial,
    searchStateByCodPostal,
    searchStateByCodSii,
    searchStatesByCity,
    searchStatesWithCities,
    addState,
    modifyState,
    removeState
};
