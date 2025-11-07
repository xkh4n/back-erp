/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('databaseUtils');
logger.level = "all";

import { config, ConnectionPool } from "mssql";

const dbConfig: config = {
    // Conexión a través del proxy (configuración recomendada)
    server: '10.2.0.10', // IP del proxy en app_net
    port: 3037, // Puerto del proxy para SQL Server
    
    // Alternativa usando hostname del proxy
    // server: `${process.env.PROXY_HOST}01dev`, // sputnik01dev
    // port: 3037,
    
    // Conexión directa a la base de datos (alternativa)
    // server: `${process.env.DB_HOST}01dev`, // cassini01dev
    // port: parseInt(process.env.DB_PORT_INTERNAL || '1433'),
    
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
        
        // Sugerir alternativas
        logger.info('💡 Alternativas a probar:');
        logger.info('1. Conexión directa por IP: 10.3.0.50:1433');
        logger.info('2. Verificar que cassini01dev esté ejecutándose');
        logger.info('3. Verificar conectividad de red entre contenedores');
        
        throw error;
    }
}