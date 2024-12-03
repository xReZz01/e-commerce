import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import Redis from 'ioredis';

const redis = new Redis({
  host: 'redis',
  port: 6379,
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

// Método genérico para manejar reintentos
const withRetries = async (action: () => Promise<any>, retries: number = 3): Promise<any> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await action();
    } catch (error) {
      attempt++;
      console.error(`Intento ${attempt} fallido:`, error.message);
      if (attempt >= retries) {
        throw error; // Lanzar error si se superan los intentos
      }
    }
  }
};

// Función para crear una orden de compra
const createOrder = async (req: Request, res: Response) => {
  const transaction = await db.transaction();

  try {
    const { product_id, quantity, payment_method, mailing_address } = req.body;

    // Validar datos de entrada
    if (!product_id || !quantity || !mailing_address) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    // Verificar inventario en cache
    const stockCacheKey = `stock_${product_id}`;
    let stock: { quantity: number } | null = JSON.parse(await redis.get(stockCacheKey));

    if (!stock) {
      try {
        // Usamos el método de reintentos para obtener el stock
        stock = await withRetries(async () => {
          const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
          return stockResponse.data;
        });
        await redis.set(stockCacheKey, JSON.stringify(stock), 'EX', 120); // Cache por 2 minutos
      } catch (error) {
        console.error('Error al obtener stock:', error.message);
        await transaction.rollback();
        return res.status(500).json({ message: 'Error al obtener stock' });
      }
    } else {
      stock = typeof stock === 'string' ? JSON.parse(stock) : stock;
    }

    if (stock === null || typeof stock !== 'object' || (stock && stock.quantity < quantity)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No hay suficiente stock disponible' });
    }

    // Obtener precio del producto del microservicio de catálogo
    let price;
    try {
      price = await withRetries(async () => {
        const productResponse = await axios.get(`http://localhost:4001/api/products/${product_id}`);
        return productResponse.data.price;
      });
    } catch (error) {
      console.error('Error al obtener el precio del producto:', error.message);
      await transaction.rollback();
      return res.status(500).json({ message: 'Error al obtener el precio del producto' });
    }

    // Procesar pago
    let paymentId;
    let purchaseId;
    try {
      const paymentData = {
        product_id,
        quantity,
        payment_method,
      };
      const paymentResponse = await axios.post('http://localhost:4003/api/payments', paymentData);
      if (paymentResponse.status !== 201) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Pago fallido' });
      }
      paymentId = paymentResponse.data.id; // Obtener ID de pago

      // Crear orden de compra
      const order = {
        product_id,
        quantity,
        total_price: price * quantity,
        payment_method,
        mailing_address,
      };
      const purchaseResponse = await axios.post('http://localhost:4004/api/purchases', order);
      if (purchaseResponse.status !== 200) {
        await transaction.rollback();
        await compensatePayment(paymentId);  // Revertir pago en caso de error
        if (purchaseResponse.data.id) {
          await compensatePurchase(purchaseResponse.data.id); // Revertir compra en caso de error
        }
        return res.status(400).json({ message: 'No se pudo realizar la compra' });
      }
      purchaseId = purchaseResponse.data.id;

      await transaction.commit();

      // Actualizar el caché
      await redis.del(`stock_${product_id}`); // Invalida el caché del stock del producto

      return res.status(200).json({ message: 'Orden creada correctamente' });
    } catch (error) {
      console.error('Error al procesar el pago o crear la orden:', error.message);
      await transaction.rollback();
      if (paymentId) {
        await compensatePayment(paymentId);  // Revertir pago si ya se creó
      }
      if (purchaseId) {
        await compensatePurchase(purchaseId); // Revertir compra si ya se creó
      }
      if (stock) {
        await compensateInventory(product_id, quantity);  // Revertir inventario si ya se redujo
      }
      return res.status(500).json({ message: 'No se pudo realizar la compra' });
    }
  } catch (error) {
    console.error('Error al crear la orden:', error.message);
    await transaction.rollback();
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Función de compensación del pago
const compensatePayment = async (paymentId: number) => {
  try {
    console.log(`Intentando revertir el pago con ID: ${paymentId}`);
    const response = await axios.delete(`http://localhost:4003/api/payments/${paymentId}`);

    if (response.status === 200) {
      console.log('Pago revertido correctamente');
    } else {
      console.error(`Error al revertir el pago, status: ${response.status}`);
      console.error('Detalles del error:', response.data);
    }
  } catch (error) {
    console.error('Error al revertir el pago:', error.message);
    // Reintentos en caso de error transitorio
    await withRetries(() => compensatePayment(paymentId), 3); 
  }
};

// Función de compensación del inventario
const compensateInventory = async (product_id: number, quantity: number) => {
  try {
    if (quantity <= 0) {
      console.error('Cantidad a revertir no válida');
      return;
    }

    const response = await axios.put(`http://localhost:4002/api/inventory/revert/${product_id}`, {
      quantity,
      input_output: 1 // Este valor debe ser 1 si estás revirtiendo una salida de stock
    });

    if (response.status === 200) {
      console.log('Stock revertido correctamente');
    } else {
      console.error('Error al revertir el stock, estado:', response.status);
      console.error('Respuesta:', response.data);
    }
  } catch (error) {
    console.error('Error al revertir el stock:', error.response?.data || error.message);
  }
};

// Función de compensación de la compra
const compensatePurchase = async (purchaseId: number) => {
  try {
    const response = await axios.delete(`http://localhost:4004/api/purchases/rollback/${purchaseId}`);
    if (response.status === 200) {
      console.log('Orden de compra revertida');
    } else {
      console.error(`Error al revertir la compra, status: ${response.status}`);
      console.error('Detalles:', response.data);
    }
  } catch (error) {
    console.error('Error al revertir la compra:', error.message);
    // Reintentos en caso de error transitorio
    await withRetries(() => compensatePurchase(purchaseId), 3); // Opcional si decides agregar reintentos.
  }
};

export { createOrder, withRetries, compensatePayment, compensateInventory, compensatePurchase };