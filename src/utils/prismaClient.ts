/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('prismaClient');
logger.level = "all";

import { PrismaClient } from '@prisma/client';

// Singleton optimizado con opciones de conexión
const prismaClientSingleton = () => {
    return new PrismaClient({
        log: process.env.NODE_ENV === 'development' 
            ? ['query', 'error', 'warn'] 
            : ['error'],
    });
};

declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;

// Función optimizada de test
export async function testPrismaConnection() {
    try {
        await prisma.$connect();
        const roleCount = await prisma.role.count();
        logger.info('✅ Prisma conectado correctamente');
        return true;
    } catch (error) {
        logger.error('❌ Error conectando con Prisma:', error instanceof Error ? error.message : 'Unknown error');
        return false;
    }
}

export { prisma, PrismaClient };