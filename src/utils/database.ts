/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('databaseUtils');
logger.level = "all";

import { config, ConnectionPool } from "mssql";

const dbConfig: config = {
    // Conexión a través del proxy (configuración recomendada)
    server: '10.2.0.10', // IP del proxy en app_net
    port: 3037, // Puerto del proxy para SQL Server
    database: `${process.env.DB_NAME}`,
    user: `${process.env.DB_USER}`,
    password: `${process.env.DB_PASSWORD}`,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool: ConnectionPool | null = null;  // <-- Esta línea faltaba

export async function getConnection(): Promise<ConnectionPool> {
    try {
        if (!pool) {
            logger.info('Inicializando conexión a base de datos...');
            
            pool = new ConnectionPool(dbConfig);
            await pool.connect();
            logger.info(`✅ Conectado a SQL Server: ${dbConfig.server}:${dbConfig.port}`);
        }
        return pool;
    } catch (error) {
        logger.error('❌ Error conectando a base de datos:', error);
        logger.error('Configuración que falló:', {
            server: dbConfig.server,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user
        });
        
        throw error;
    }
}