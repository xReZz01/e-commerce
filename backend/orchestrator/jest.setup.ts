import { config } from 'dotenv';
config({ path: '.env.test' });

import db from './src/config/db';
import { beforeAll, afterAll, afterEach } from '@jest/globals';
import { jest } from '@jest/globals';

// Configuración antes de todas las pruebas
beforeAll(async () => {
  // Sincroniza la base de datos con fuerza (borra datos anteriores)
  console.log('Sincronizando base de datos');
  await db.sync({ force: true });
  console.log('Base de datos sincronizada.');
});

// Limpia mocks después de cada prueba
afterEach(() => {
  // Borra todos los mocks para evitar interferencias entre pruebas
  jest.clearAllMocks();
  console.log('Mocks borrados luego de los tests.');
});

// Configuración después de todas las pruebas
afterAll(async () => {
  // Cierra la conexión a la base de datos
  console.log('Cerrando conexión a la base de datos.');
  await db.close();
  console.log('Conexión con base de datos cerrada.');
});