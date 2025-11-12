/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('prismaClient');
logger.level = "all";

import { PrismaClient } from '@prisma/client';

// Crear instancia con tipos explícitos
const prisma = new PrismaClient();

// Verificar que los modelos están disponibles
//console.log('Modelos disponibles:', Object.getOwnPropertyNames(prisma).filter(name => !name.startsWith('$') && !name.startsWith('_')));

// Test rápido para verificar acceso a modelos
/*
(async () => {
    try {
        // @ts-ignore - Ignorar error de tipos temporalmente para probar
        const countriesModel = prisma.countries;
        if (countriesModel) {
            logger.info('Modelo countries está disponible');
        } else {
            logger.error('Modelo countries NO está disponible');
        }
    } catch (error) {
        logger.error('Error accediendo a modelo countries:', error);
    }
})();
*/

// Función de ejemplo para probar la conexión
export async function testPrismaConnection() {
    try {
        // Contar roles en la base de datos
        if(!prisma){
            throw new Error('Prisma Client no está inicializado');
        }
        const roleCount = await prisma.role.count();
        return true;
    } catch (error) {
        logger.error('Error conectando con Prisma:', error.message);
        return false;
    } finally {
        await prisma.$disconnect();
    }
}

// Función para validar si el cliente está generado
export async function validatePrismaClient() {
    try {
        // Verificar si los modelos están disponibles
        const hasCountriesModel = 'countries' in prisma;
        const hasCitiesModel = 'cities' in prisma;
        const hasRoleModel = 'role' in prisma;
        
        if (hasCountriesModel && hasCitiesModel && hasRoleModel) {
            logger.info('Cliente de Prisma generado correctamente con todos los modelos');
            return true;
        } else {
            logger.warn('Cliente de Prisma incompleto - faltan modelos');
            return false;
        }
    } catch (error) {
        logger.error('Error validando cliente de Prisma:', error);
        return false;
    }
}

export { prisma, PrismaClient };