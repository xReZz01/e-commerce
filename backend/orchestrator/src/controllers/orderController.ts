import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import cache from 'memory-cache';

export const createOrder = async (req: Request, res: Response) => {
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
        // Pone en cache el stock del producto
        const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
        stock = stockResponse.data;
        cache.put(stockCacheKey, stock, 60000); // Cache por 60 segundos
      } catch (error) {
        console.error('Error al obtener stock:', error);
        await transaction.rollback();
        if (axios.isAxiosError(error)) {
          return res.status(500).json({ message: 'Error al obtener stock', error: error.response?.data });
        }
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
      const productResponse = await axios.get(`http://localhost:4001/api/products/${product_id}`);
      price = productResponse.data.price;
    } catch (error) {
      console.error('Error al obtener el precio del producto:', error);
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
        return res.status(400).json({ message: 'Error al crear una orden de pago' });
      }
      purchaseId = purchaseResponse.data.id;

      await transaction.commit();

      // Actualizar el caché
      cache.del(`stock_${product_id}`); // Invalida el caché del stock del producto

      return res.status(200).json({ message: 'Orden creada correctamente' });
    } catch (error) {
      console.error('Error al procesar el pago o crear la orden:', error);
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
      return res.status(500).json({ message: 'Error al procesar el pago o crear la orden', error: error.response?.data });
    }
  } catch (error) {
    console.error('Error al crear la orden:', error);
    await transaction.rollback();
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Función de compensación del pago
const compensatePayment = async (paymentId: number) => {
  try {
    await axios.delete(`http://localhost:4003/api/payments/${paymentId}`);
    console.log('Pago revertido');
  } catch (error) {
    console.error('Error al revertir el pago:', error);
  }
};

// Función de compensación del inventario
const compensateInventory = async (product_id: number, quantity: number) => {
  try {
    const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
    if (stockResponse.data) {
      const newStock = stockResponse.data.quantity + quantity;
      await axios.put(`http://localhost:4002/api/inventory/${product_id}`, { quantity: newStock });
      console.log('Stock revertido');
    } else {
      console.error('Stock no encontrado para revertir');
    }
  } catch (error) {
    console.error('Error al revertir el stock:', error);
  }
};

// Función de compensación de la compra
const compensatePurchase = async (purchaseId: number) => {
  try {
    await axios.delete(`http://localhost:4004/api/purchases/${purchaseId}`);
    console.log('Orden de compra revertida');
  } catch (error) {
    console.error('Error al revertir la compra:', error);
  }
};