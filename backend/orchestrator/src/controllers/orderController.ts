import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';

export const createOrder = async (req: Request, res: Response) => {
  const transaction = await db.transaction(); // Assuming db is set up

  try {
    const { product_id, quantity, payment_method, purchase_date, mailing_address } = req.body;

    // Validar datos de entrada
    if (!product_id || !quantity || !mailing_address) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    // Verificar inventario
    try {
      const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
      const stock = stockResponse.data;
      if (!stock || stock.quantity < quantity) {
        await transaction.rollback();
        return res.status(400).json({ message: 'No hay suficiente stock disponible' });
      }
    } catch (error) {
      console.error('Error al obtener stock:', error);
      await transaction.rollback();
      if (axios.isAxiosError(error)) {
        return res.status(500).json({ message: 'Error al obtener stock', error: error.response?.data });
      }
      return res.status(500).json({ message: 'Error al obtener stock' });
    }

    // Procesar pago
    const paymentData = { product_id, quantity, payment_method };
    try {
      const paymentResponse = await axios.post('http://localhost:4003/api/payments', paymentData);
      if (paymentResponse.status !== 201) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Pago fallido' });
      }
    } catch (error) {
      console.error('Error al procesar pago:', error);
      await transaction.rollback();
      if (axios.isAxiosError(error)) {
        return res.status(500).json({ message: 'Error al procesar pago', error: error.response?.data });
      }
      return res.status(500).json({ message: 'Error al procesar pago' });
    }

    // Crear orden de compra
    const orderData = { product_id, quantity, purchase_date, mailing_address };
    try {
      const purchaseResponse = await axios.post('http://localhost:4004/api/purchases', orderData);
      if (purchaseResponse.status !== 201) {
        // Compensar pago
        await axios.post('http://localhost:4003/api/payments/compensate', paymentData);
        await transaction.rollback();
        return res.status(400).json({ message: 'Error al crear la orden de compra' });
      }
    } catch (error) {
      console.error('Error al crear la orden de compra:', error);
      // Compensar pago
      await axios.post('http://localhost:4003/api/payments/compensate', paymentData);
      await transaction.rollback();
      if (axios.isAxiosError(error)) {
        return res.status(500).json({ message: 'Error al crear la orden de compra', error: error.response?.data });
      }
      return res.status(500).json({ message: 'Error al crear la orden de compra' });
    }

    await transaction.commit();
    return res.status(200).json({ message: 'Orden creada correctamente' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Error al crear la orden', error });
  }
};

export const createOrderSaga = async (req: Request, res: Response) => {
  const { product_id, quantity, payment_method, purchase_date, mailing_address } = req.body;

  const transaction = await db.transaction();

  try {
    // Verificar inventario
    const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
    const stock = stockResponse.data;
    if (!stock || stock.quantity < quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No hay suficiente stock disponible' });
    }

    // Procesar pago
    const paymentData = { product_id, quantity, payment_method };
    const paymentResponse = await axios.post('http://localhost:4003/api/payments', paymentData);
    if (paymentResponse.status !== 201) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Pago fallido' });
    }

    // Crear orden de compra 
    const orderData = { product_id, quantity, purchase_date, mailing_address };
    const purchaseResponse = await axios.post('http://localhost:4004/api/purchases', orderData);
    if (purchaseResponse.status !== 201) {
      // Compensar pago
      await axios.post('http://localhost:4003/api/payments/compensate', paymentData);
      await transaction.rollback();
      return res.status(400).json({ message: 'Error al crear la orden de compra' });
    }

    await transaction.commit();
    return res.status(200).json({ message: 'Orden creada correctamente' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Error al crear la orden', error });
  }
};