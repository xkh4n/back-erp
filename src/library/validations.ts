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

export interface CityValidationData {
    iata_codes: string;
    name_city: string;
    pais: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedData?: CountryValidationData;
}

export interface CityValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedData?: CityValidationData;
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
        // Sanitización más eficiente con regex combinada
        let sanitized = input
            .replace(/['";\\\-\/\*]/g, '') // Remover caracteres peligrosos comunes
            .replace(/\b(xp_|sp_|exec|execute|union|select|insert|update|delete|drop|alter|create)\b/gi, '') // Palabras SQL
            .trim();

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

/**
 * Valida los campos de una ciudad (iata_codes, name_city, pais)
 * @param data - Datos de la ciudad a validar
 * @returns Resultado de validación con errores y datos sanitizados
 */
const validateCityFields = (data: CityValidationData): CityValidationResult => {
    const errors: string[] = [];
    
    try {
        // Validar que los campos existan
        if (!data) {
            errors.push('Los datos de la ciudad son requeridos');
            return { isValid: false, errors };
        }

        // Validar iata_codes
        if (!data.iata_codes || typeof data.iata_codes !== 'string') {
            errors.push('El código IATA de la ciudad es requerido y debe ser una cadena de texto');
        } else {
            const sanitizedIata = sanitizeString(data.iata_codes);
            if (sanitizedIata.length < 2 || sanitizedIata.length > 5) {
                errors.push('El código IATA de la ciudad debe tener entre 2 y 5 caracteres');
            }
            if (!/^[A-Z0-9]{2,5}$/.test(sanitizedIata.toUpperCase())) {
                errors.push('El código IATA de la ciudad solo debe contener letras mayúsculas y números');
            }
        }

        // Validar name_city
        if (!data.name_city || typeof data.name_city !== 'string') {
            errors.push('El nombre de la ciudad es requerido y debe ser una cadena de texto');
        } else {
            const sanitizedName = sanitizeString(data.name_city);
            if (sanitizedName.length < 2 || sanitizedName.length > 100) {
                errors.push('El nombre de la ciudad debe tener entre 2 y 100 caracteres');
            }
        }

        // Validar pais (código IATA del país)
        if (!data.pais || typeof data.pais !== 'string') {
            errors.push('El código del país es requerido y debe ser una cadena de texto');
        } else {
            const sanitizedPais = sanitizeString(data.pais);
            if (sanitizedPais.length !== 3) {
                errors.push('El código del país debe tener exactamente 3 caracteres');
            }
            if (!/^[A-Z]{3}$/.test(sanitizedPais.toUpperCase())) {
                errors.push('El código del país solo debe contener letras mayúsculas');
            }
        }

        // Si no hay errores, retornar datos sanitizados
        if (errors.length === 0) {
            const sanitizedData: CityValidationData = {
                iata_codes: sanitizeString(data.iata_codes).toUpperCase(),
                name_city: sanitizeString(data.name_city),
                pais: sanitizeString(data.pais).toUpperCase()
            };

            return {
                isValid: true,
                errors: [],
                sanitizedData
            };
        }

        logger.warn(`Validación de ciudad fallida: ${errors.join(', ')}`);
        return {
            isValid: false,
            errors
        };

    } catch (error) {
        logger.error('Error durante la validación de ciudad:', error);
        return {
            isValid: false,
            errors: ['Error interno durante la validación']
        };
    }
};

export {
    sanitizeString,
    validateCountryFields,
    validateCityFields
};