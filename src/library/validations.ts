/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('validations');
logger.level = "all";

// Interfaces para validaciones
export interface CountryValidationData {
    iso_code: string;
    name_country: string;
    iata_code: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedData?: CountryValidationData;
}

/**
 * Escapa caracteres especiales para prevenir SQL injection
 * @param input - String a sanitizar
 * @returns String sanitizado
 */
const sanitizeString = (input: string): string => {
    if (!input || typeof input !== 'string') {
        return '';
    }

    try {
        // Remover caracteres peligrosos para SQL injection
        let sanitized = input
            // Escapar comillas simples duplicándolas (método SQL estándar)
            .replace(/'/g, "''")
            // Remover o escapar otros caracteres peligrosos
            .replace(/;/g, '') // Remover punto y coma
            .replace(/--/g, '') // Remover comentarios SQL
            .replace(/\/\*/g, '') // Remover inicio de comentario multilinea
            .replace(/\*\//g, '') // Remover fin de comentario multilinea
            .replace(/xp_/gi, '') // Remover comandos extendidos de SQL Server
            .replace(/sp_/gi, '') // Remover stored procedures peligrosos
            .replace(/exec/gi, '') // Remover EXEC
            .replace(/execute/gi, '') // Remover EXECUTE
            .replace(/union/gi, '') // Remover UNION (común en inyecciones)
            .replace(/select/gi, '') // Remover SELECT
            .replace(/insert/gi, '') // Remover INSERT
            .replace(/update/gi, '') // Remover UPDATE
            .replace(/delete/gi, '') // Remover DELETE
            .replace(/drop/gi, '') // Remover DROP
            .replace(/alter/gi, '') // Remover ALTER
            .replace(/create/gi, '') // Remover CREATE
            // Limitar a caracteres alfanuméricos, espacios, guiones y algunos especiales seguros
            .replace(/[^a-zA-Z0-9\s\-_.]/g, '');

        // Trim espacios en blanco al inicio y final
        sanitized = sanitized.trim();
        return sanitized;
    } catch (error) {
        logger.error('Error al sanitizar string:', error);
        return '';
    }
};

/**
 * Valida los campos de un país (iso_code, name_country, iata_code)
 * @param data - Datos del país a validar
 * @returns Resultado de validación con errores y datos sanitizados
 */
const validateCountryFields = (data: CountryValidationData): ValidationResult => {
    const errors: string[] = [];
    
    try {
        
        // Validar que los campos existan
        if (!data) {
            errors.push('Los datos del país son requeridos');
            return { isValid: false, errors };
        }

        // Validar iso_code
        if (!data.iso_code || typeof data.iso_code !== 'string') {
            errors.push('El código ISO es requerido y debe ser una cadena de texto');
        } else {
            const sanitizedIso = sanitizeString(data.iso_code);
            if (sanitizedIso.length < 2 || sanitizedIso.length > 3) {
                errors.push('El código ISO debe tener entre 2 y 3 caracteres');
            }
            if (!/^[A-Z]{2,3}$/.test(sanitizedIso.toUpperCase())) {
                errors.push('El código ISO solo debe contener letras mayúsculas');
            }
        }

        // Validar name_country
        if (!data.name_country || typeof data.name_country !== 'string') {
            errors.push('El nombre del país es requerido y debe ser una cadena de texto');
        } else {
            const sanitizedName = sanitizeString(data.name_country);
            if (sanitizedName.length < 2 || sanitizedName.length > 100) {
                errors.push('El nombre del país debe tener entre 2 y 100 caracteres');
            }
            if (!/^[a-zA-Z\s\-_.]+$/.test(sanitizedName)) {
                errors.push('El nombre del país solo puede contener letras, espacios, guiones, puntos y guiones bajos');
            }
        }

        // Validar iata_code
        if (!data.iata_code || typeof data.iata_code !== 'string') {
            errors.push('El código IATA es requerido y debe ser una cadena de texto');
        } else {
            const sanitizedIata = sanitizeString(data.iata_code);
            if (sanitizedIata.length !== 2 && sanitizedIata.length !== 3) {
                errors.push('El código IATA debe tener 2 o 3 caracteres');
            }
            if (!/^[A-Z]{2,3}$/.test(sanitizedIata.toUpperCase())) {
                errors.push('El código IATA solo debe contener letras mayúsculas');
            }
        }

        // Si no hay errores, retornar datos sanitizados
        if (errors.length === 0) {
            const sanitizedData: CountryValidationData = {
                iso_code: sanitizeString(data.iso_code).toUpperCase(),
                name_country: sanitizeString(data.name_country),
                iata_code: sanitizeString(data.iata_code).toUpperCase()
            };

            logger.info('Validación exitosa, campos sanitizados');
            return {
                isValid: true,
                errors: [],
                sanitizedData
            };
        }

        logger.warn(`Validación fallida: ${errors.join(', ')}`);
        return {
            isValid: false,
            errors
        };

    } catch (error) {
        logger.error('Error durante la validación:', error);
        return {
            isValid: false,
            errors: ['Error interno durante la validación']
        };
    }
};

export {
    sanitizeString,
    validateCountryFields
};