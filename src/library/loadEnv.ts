/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger('loadEnv');
logger.level = "all";


// src/libs/loadEnv.ts
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

/**
 * Carga las variables de entorno desde el archivo .env en la carpeta Environment
 */
export function loadEnv(): void {
  // Ruta relativa al archivo .env (desde la raíz del proyecto backend)
    const envPath = path.resolve(__dirname, '../../../Environment/.env');
    logger.warn(`Intentando cargar archivo .env desde: ${envPath}`);
    // Verifica que el archivo exista
    if (!fs.existsSync(envPath)) {
        console.warn(`⚠️  Advertencia: No se encontró el archivo .env en ${envPath}`);
        console.warn('   Continuando con variables de entorno del sistema (si existen).');
        return;
    }

    // Cargar el archivo .env en process.env
    const result = dotenv.config({ path: envPath });

    if (result.error) {
        throw new Error(`Error al cargar el archivo .env: ${result.error.message}`);
    }

    console.log(`✅ Variables de entorno cargadas desde: ${envPath}`);
}

// Exporta por defecto (opcional)
export default loadEnv;