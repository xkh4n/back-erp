/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('index');
logger.level = "all";

/* API */
import app from './server';

/* Prisma */
import { testPrismaConnection } from "./utils/prismaClient";

const port = Number(process.env.BACK_PORT_INTERNAL || 3000);
(async () => {
    try {
        // Solo probar conexión de Prisma
        const prismaConnected = await testPrismaConnection();
        if (!prismaConnected) {
            throw new Error('No se pudo conectar a la base de datos con Prisma');
        }
        
        logger.info('Base de datos conectada correctamente mediante Prisma');
        
        await app.listen(port, () => {
            logger.debug(`Server is Running in: http://localhost:${port}/api/${process.env.API_VERSION}/`);
        });
    } catch (error) {
        logger.error("Connection to BDD is Fail: ", error);
    }
})();