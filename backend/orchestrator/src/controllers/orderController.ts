import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import compensateSaga from '../services/compensations'; // Importación de las funciones de compensación

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
  let paymentId: number | undefined;
  let purchaseId: number | undefined;

  try {
    const { product_id, quantity, payment_method, mailing_address } = req.body;

    // Validar datos de entrada
    if (!product_id || !quantity || !mailing_address) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    // Verificar inventario
    let stock: { quantity: number } | null;
    try {
      stock = await withRetries(async () => {
        const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
        return stockResponse.data;
      }, 1); // Limitar a un reintento
    } catch (error) {
      console.error('Error al obtener stock:', error.message);
      await transaction.rollback();
      return res.status(500).json({ message: 'Error al obtener stock' });
    }

    if (!stock || stock.quantity < quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No hay suficiente stock disponible' });
    }

    // Obtener precio del producto
    let price: number;
    try {
      price = await withRetries(async () => {
        const productResponse = await axios.get(`http://localhost:4001/api/products/${product_id}`);
        return productResponse.data.price;
      }, 1); // Limitar a un reintento
    } catch (error) {
      console.error('Error al obtener el precio del producto:', error.message);
      await transaction.rollback();
      return res.status(500).json({ message: 'Error al obtener el precio del producto' });
    }

    // Procesar pago
    try {
      const paymentData = { product_id, quantity, payment_method };
      const paymentResponse = await axios.post('http://localhost:4003/api/payments', paymentData);

      if (paymentResponse.status !== 201) {
        await transaction.rollback();
        console.error('Error en el pago:', paymentResponse.data); // Información detallada del error
        return res.status(400).json({ message: 'Pago fallido', error: paymentResponse.data });
      }

      paymentId = paymentResponse.data.id;

      // Crear orden de compra
      const order = { product_id, quantity, total_price: price * quantity, payment_method, mailing_address };
      const purchaseResponse = await axios.post('http://localhost:4004/api/purchases', order);

      if (purchaseResponse.status !== 200) {
        await transaction.rollback();
        if (paymentId) {
          await compensateSaga(paymentId, 0, product_id, quantity); // Revertir pago si la compra falla
        }
        return res.status(400).json({ message: 'No se pudo realizar la compra' });
      }
      purchaseId = purchaseResponse.data.id;

      // Commit de la transacción después de todo
      await transaction.commit();

      return res.status(200).json({ message: 'Orden creada correctamente' });
    } catch (error) {
      console.error('Error al procesar el pago o crear la orden:', error.message);
    
      // Verifica si el error tiene una respuesta detallada (como el error de la API de pagos)
      if (error.response) {
        console.error('Detalles del error de respuesta:', error.response.data); // Información adicional del error
      }
    
      // Si se ha procesado un pago, revertirlo
      if (paymentId) {
        try {
          await compensateSaga(paymentId, 0, product_id, quantity); // Revertir pago si hay un error
        } catch (compensateError) {
          console.error('Error al revertir el pago:', compensateError.message);
        }
      }
    
      // Si se ha creado una compra, revertirla
      if (purchaseId) {
        try {
          await compensateSaga(0, purchaseId, product_id, quantity); // Revertir compra si hay un error
        } catch (compensateError) {
          console.error('Error al revertir la compra:', compensateError.message);
        }
      }
    
      // Si hubo un problema con el inventario, revertirlo también
      if (paymentId || purchaseId) {
        try {
          await compensateSaga(paymentId || 0, purchaseId || 0, product_id, quantity); // Revertir inventario si es necesario
        } catch (compensateError) {
          console.error('Error al revertir el inventario:', compensateError.message);
        }
      }
    
      // Revertir la transacción si se produjo un error
      await transaction.rollback(); // Solo hacer rollback si se produjo un error al procesar
      return res.status(500).json({ message: 'No se pudo realizar la compra' });
    }
  } catch (error) {
    console.error('Error al crear la orden:', error.message);
    await transaction.rollback();
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export { createOrder };
