import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import cache from 'memory-cache';

// Método genérico para manejar reintentos
const withRetries = async (action: () => Promise<any>, retries: number = 3): Promise<any> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await action();
    } catch (error) {
      attempt++;
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
    let stock = cache.get(stockCacheKey);

    if (!stock) {
      try {
        // Usamos el método de reintentos para obtener el stock
        stock = await withRetries(async () => {
          const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
          return stockResponse.data;
        });
        cache.put(stockCacheKey, stock, 300000); // Cache por 5 minutos
      } catch (error) {
        console.error('Error al obtener stock');
        await transaction.rollback();
        return res.status(500).json({ message: 'Error al obtener stock' });
      }
    }

    if (!stock || stock.quantity < quantity) {
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
      console.error('Error al obtener el precio del producto');
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
        payment_method
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
        mailing_address
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
      cache.del(`stock_${product_id}`); // Invalida el caché del stock del producto

      return res.status(200).json({ message: 'Orden creada correctamente' });
    } catch (error) {
      console.error('Error al procesar el pago o crear la orden');
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
    console.error('Error al crear la orden');
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
      if (response.data) {
        console.error('Detalles del error:', response.data);
      }
    }
  } catch (error) {
    console.error('Error al revertir el pago:', error.message);

    if (axios.isAxiosError(error)) {
      console.error('Detalles del error de Axios:', error.response?.data);
      console.error('Detalles del error de Axios, código:', error.response?.status);
    } else {
      console.error('Error no relacionado con Axios:', error);
    }
  }
};

// Función de compensación del inventario
const compensateInventory = async (product_id: number, quantity: number) => {
  try {
    // Obtener el stock actual
    const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
    
    if (stockResponse.data) {
      // Asegúrate de que 'input_output' se envíe con el valor correcto
      const response = await axios.put(
        `http://localhost:4002/api/inventory/revert/${product_id}`, 
        { 
          quantity,          // La cantidad que deseas revertir
          input_output: 1    // Este valor debe ser 1 (entrada) si estás revirtiendo una salida de stock
        }
      );

      if (response.status === 200) {
        console.log('Stock revertido correctamente');
      } else {
        console.error('Error al revertir el stock, estado:', response.status);
        console.error('Respuesta:', response.data);
      }
    } else {
      console.error('Stock no encontrado para revertir');
    }
  } catch (error) {
    console.error('Error al revertir el stock:', error.response?.data || error.message);
  }
};

// Función de compensación de la compra
const compensatePurchase = async (purchaseId: number) => {
  try {
    const response = await axios.delete(`http://localhost:4004/api/purchases/rollback${purchaseId}`);
    if (response.status === 200) {
      console.log('Orden de compra revertida');
    } else {
      console.error(`Error al revertir la compra: ${response.status}`);
    }
  } catch (error) {
    console.error('Error al revertir la compra:', error.message);
  }
};

export { createOrder, withRetries, compensatePayment, compensateInventory, compensatePurchase };
