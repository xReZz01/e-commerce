import { Request, Response } from 'express';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { createOrder } from '../../controllers/orderController';

// Para correr test pararse en orquestador y poner en terminal: npx jest

// Mock para la base de datos
jest.mock('src/config/db', () => ({
  transaction: jest.fn().mockReturnValue({
    commit: jest.fn(),
    rollback: jest.fn(),
  }),
}));

// Mock para Axios
const mockAxios = new MockAdapter(axios);

describe('createOrder', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: {
        product_id: 1,
        quantity: 2,
        payment_method: 'credit_card',
        mailing_address: '123 Main St',
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockAxios.reset(); // Resetear los mocks de axios
  });

  it('debe crear una orden de compra correctamente', async () => {
    // Mock de las respuestas de las APIs
    mockAxios.onGet('http://localhost:4001/api/products/1').reply(200, { price: 100 });
    mockAxios.onGet('http://localhost:4002/api/inventory/1').reply(200, { quantity: 10 });
    mockAxios.onPost('http://localhost:4003/api/payments').reply(201, { id: 1 });
    mockAxios.onPost('http://localhost:4004/api/purchases').reply(200, { id: 1 });

    await createOrder(req as Request, res as Response);

    // Comprobar que la respuesta fue exitosa
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Orden creada correctamente' });
  });
  
  it('debe retornar 400 si el stock no es suficiente', async () => {
    // Simular que el stock es insuficiente
    mockAxios.onGet('http://localhost:4002/api/inventory/1').reply(200, { quantity: 1 });

    await createOrder(req as Request, res as Response);

    // Comprobar que la respuesta es 400 cuando no hay suficiente stock
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'No hay suficiente stock disponible' });
  });

  it('debe retornar 500 si hay un error al obtener stock', async () => {
    // Simular un error en la API de inventario
    mockAxios.onGet('http://localhost:4002/api/inventory/1').networkError();

    await createOrder(req as Request, res as Response);

    // Comprobar que la respuesta es 500 cuando hay un error al obtener stock
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Error al obtener stock' });
  });
});
