import axios from 'axios'; // Importa axios para realizar solicitudes HTTP simuladas.
import db from '../config/db'; // Importa la configuración de la base de datos.
import { createOrder } from '../controllers/orderController'; // Importa la función que se va a probar.

jest.mock('axios'); // Simula el módulo axios para controlar sus respuestas en los tests.
jest.mock('../config/db'); // Simula la configuración de la base de datos.

describe('Order Controller', () => {
  let req: any, res: any, next: any;

  beforeEach(() => {
    // Inicializa los objetos `req`, `res` y `next` antes de cada prueba.
    req = { 
      body: { 
        product_id: 1, // Producto de ejemplo con ID 1.
        quantity: 2, // Cantidad de productos a ordenar.
        payment_method: 'Tarejeta', // Método de pago simulado.
        mailing_address: 'Mi casa' // Dirección de envío.
      } 
    };

    res = { 
      status: jest.fn().mockReturnThis(), // Simula el método `status` que devuelve el objeto `res`.
      json: jest.fn() // Simula el método `json` para capturar respuestas JSON.
    };

    next = jest.fn(); // Simula el middleware `next`.

    // Simula una transacción con métodos `commit` y `rollback`.
    const transaction = {
      commit: jest.fn(), // Simula la confirmación de la transacción.
      rollback: jest.fn() // Simula la reversión de la transacción.
    };

    // Mock para devolver la transacción simulada al llamar `db.transaction`.
    (db.transaction as jest.Mock).mockResolvedValue(transaction);
  });

  it('should create an order successfully', async () => {
    // Simula respuestas de axios para consultas al inventario y al catálogo de productos.
    (axios.get as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/inventory')) 
        return Promise.resolve({ data: { quantity: 10 } }); // Inventario con suficiente stock.
      if (url.includes('/api/products')) 
        return Promise.resolve({ data: { price: 100 } }); // Producto con precio de 100.
      return Promise.reject(); // Rechaza cualquier otro caso.
    });

    // Simula respuestas de axios para el procesamiento de pagos y creación de órdenes.
    (axios.post as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/payments')) 
        return Promise.resolve({ status: 201, data: { id: 1 } }); // Pago exitoso con ID 1.
      if (url.includes('/api/purchases')) 
        return Promise.resolve({ status: 200, data: { id: 1 } }); // Orden creada con éxito.
      return Promise.reject(); // Rechaza cualquier otro caso.
    });

    // Llama a la función `createOrder` con los datos simulados.
    await createOrder(req, res);

    // Verifica que la respuesta tenga un código de estado 200.
    expect(res.status).toHaveBeenCalledWith(200);

    // Verifica que la respuesta JSON contiene el mensaje de éxito esperado.
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Orden creada correctamente' }));
  });

  it('should rollback transaction if payment fails', async () => {
    // Simula un fallo en el pago (código de estado 400).
    (axios.post as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/payments')) 
        return Promise.resolve({ status: 400 }); // Pago fallido.
      return Promise.reject(); // Rechaza cualquier otro caso.
    });

    // Llama a la función `createOrder` con los datos simulados.
    await createOrder(req, res);

    // Verifica que la respuesta tenga un código de estado 400.
    expect(res.status).toHaveBeenCalledWith(400);

    // Verifica que la respuesta JSON contiene el mensaje de fallo esperado.
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Pago fallido' }));
  });
});
