# scripts/start-dev.sh
#!/bin/bash
# Ejecutar db push al inicio
npx prisma db push

# Iniciar nodemon para el schema en background
npx nodemon --config nodemon-schema.json &

# Iniciar la aplicación principal
npm run dev