import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import cache from 'memory-cache';

export const createOrder = async (req: Request, res: Response) => {
  const transaction = await db.transaction(); 

  try {
    const { product_id, quantity, payment_method, purchase_date, mailing_address } = req.body;

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

    // Procesar pago
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

      // Crear orden de compra
      const order = {
        product_id,
        quantity,
        total_price: paymentResponse.data.total_price,
        payment_method,
        mailing_address
      };
      const purchaseResponse = await axios.post('http://localhost:4004/api/purchases', order);
      if (purchaseResponse.status !== 200) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Error al crear una orden de pago' });
      }

      await transaction.commit();

      // Actualizar el caché
      cache.del(`stock_${product_id}`); // Invalida el caché del stock del producto

      return res.status(200).json({ message: 'Orden creada correctamente' });
    } catch (error) {
      console.error('Error al procesar el pago o crear la orden:', error);
      await transaction.rollback();
      return res.status(500).json({ message: 'Error al procesar el pago o crear la orden', error: error.response?.data });
    }
  } catch (error) {
    console.error('Error al crear la orden:', error);
    await transaction.rollback();
    if (axios.isAxiosError(error)) {
      return res.status(500).json({ message: 'Error en la solicitud externa', error: error.response?.data });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};