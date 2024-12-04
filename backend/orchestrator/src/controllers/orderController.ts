import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import compensateSaga from '../services/compensations'; // Importación de las funciones de compensación

// Funcion generica para manejar reintentos
const withRetries = async (action: () => Promise<any>, retries: number = 3): Promise<any> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await action();
    } catch (error) {
      attempt++;
      console.error(`Intento ${attempt} fallido:`, error.message); // Registro del intento fallido
      if (attempt >= retries) {
        throw error; // Lanzar error si se superan los intentos
      }
    }
  }
};

// Controlador para crear una orden con id de pago y compra
const createOrder = async (req: Request, res: Response) => {
  const transaction = await db.transaction(); // Crear transacción para operaciones atómicas
  let paymentId: number | undefined; 
  let purchaseId: number | undefined; 

  try {
    const { product_id, quantity, payment_method, mailing_address } = req.body;

    // Validar datos requeridos
    if (!product_id || !quantity || !mailing_address) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    // Intentar obtener el stock del producto
    let stock: { quantity: number } | null;
    try {
      stock = await withRetries(async () => {
        const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
        return stockResponse.data; // Devolver datos del stock
      }, 1); // Intentar una vez
    } catch (error) {
      console.error('Error al obtener stock:', error.message);
      await transaction.rollback(); // Revertir transacción si falla
      return res.status(500).json({ message: 'Error al obtener stock' });
    }

    // Validar si hay suficiente stock
    if (!stock || stock.quantity < quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No hay suficiente stock disponible' });
    }

    // Intentar obtener el precio del producto
    let price: number;
    try {
      price = await withRetries(async () => {
        const productResponse = await axios.get(`http://localhost:4001/api/products/${product_id}`);
        return productResponse.data.price; // Devolver precio del producto
      }, 1); // Intentar una vez
    } catch (error) {
      console.error('Error al obtener el precio del producto:', error.message);
      await transaction.rollback(); // Revertir transacción si falla
      return res.status(500).json({ message: 'Error al obtener el precio del producto' });
    }

    // Procesar el pago
    try {
      const paymentData = { product_id, quantity, payment_method };
      const paymentResponse = await axios.post('http://localhost:4003/api/payments', paymentData);

      if (paymentResponse.status !== 201) {
        await transaction.rollback(); // Revertir transacción si falla
        console.error('Error en el pago:', paymentResponse.data); // Información detallada del error
        return res.status(400).json({ message: 'Pago fallido', error: paymentResponse.data });
      }

      paymentId = paymentResponse.data.id; // Guardar ID del pago

      // Crear la compra asociada
      const order = { product_id, quantity, total_price: price * quantity, payment_method, mailing_address };
      const purchaseResponse = await axios.post('http://localhost:4004/api/purchases', order);

      if (purchaseResponse.status !== 200) {
        await transaction.rollback();
        if (paymentId) {
          await compensateSaga(paymentId, 0, product_id, quantity); // Revertir pago si la compra falla
        }
        return res.status(400).json({ message: 'No se pudo realizar la compra' });
      }
      purchaseId = purchaseResponse.data.id; // Guardar ID de la compra

      await transaction.commit(); // Confirmar transacción

      return res.status(200).json({ message: 'Orden creada correctamente' });
    } catch (error) {
      console.error('Error al procesar el pago o crear la orden:', error.message);

      // Manejo de errores específicos
      if (error.response) {
        console.error('Detalles del error de respuesta:', error.response.data);
      }

      // Revertir el pago si ya se procesó
      if (paymentId) {
        try {
          await compensateSaga(paymentId, 0, product_id, quantity);
        } catch (compensateError) {
          console.error('Error al revertir el pago:', compensateError.message);
        }
      }

      // Revertir la compra si ya se creó
      if (purchaseId) {
        try {
          await compensateSaga(0, purchaseId, product_id, quantity);
        } catch (compensateError) {
          console.error('Error al revertir la compra:', compensateError.message);
        }
      }

      // Revertir inventario si aplica
      if (paymentId || purchaseId) {
        try {
          await compensateSaga(paymentId || 0, purchaseId || 0, product_id, quantity);
        } catch (compensateError) {
          console.error('Error al revertir el inventario:', compensateError.message);
        }
      }

      await transaction.rollback(); // Revertir transacción si ocurre un error
      return res.status(500).json({ message: 'No se pudo realizar la compra' });
    }
  } catch (error) {
    console.error('Error al crear la orden:', error.message);
    await transaction.rollback(); // Revertir transacción en caso de error general
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export { createOrder }; // Exportar la función para manejar la creación de órdenes
