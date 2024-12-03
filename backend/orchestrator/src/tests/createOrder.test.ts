import { Request, Response } from 'express';
import Redis from 'ioredis-mock';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { createOrder } from '../controllers/orderController'; // Ajusta la ruta según sea necesario

jest.mock('../config/db', () => ({
  transaction: jest.fn().mockReturnValue({
    commit: jest.fn(),
    rollback: jest.fn(),
  }),
}));

const redis = new Redis();
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

    redis.flushall();
    mockAxios.reset();
  });

  it('should create an order successfully', async () => {
    redis.set('stock_1', JSON.stringify({ quantity: 10 }));

    mockAxios.onGet('http://localhost:4001/api/products/1').reply(200, { price: 100 });
    mockAxios.onPost('http://localhost:4003/api/payments').reply(201, { id: 1 });
    mockAxios.onPost('http://localhost:4004/api/purchases').reply(200, { id: 1 });

    await createOrder(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Orden creada correctamente' });
  });

  it('should return 400 if stock is insufficient', async () => {
    redis.set('stock_1', JSON.stringify({ quantity: 1 }));

    await createOrder(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'No hay suficiente stock disponible' });
  });

  it('should return 500 if there is an error obtaining stock', async () => {
    mockAxios.onGet('http://localhost:4002/api/inventory/1').networkError();

    await createOrder(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Error al obtener stock' });
  });

  // Agrega más tests según sea necesario
});
