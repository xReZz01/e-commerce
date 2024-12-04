import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import Payments from '../models/Payment.model';

class PaymentController {
  // Método genérico para manejar reintentos
  static async withRetries(action: () => Promise<any>, retries: number = 3): Promise<any> {
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
  }

  // Método para obtener todos los pagos
  static async getPayments(req: Request, res: Response): Promise<Response> {
    try {
      const payments = await Payments.findAll({
        attributes: { exclude: ['createdAt', 'updatedAt'] },
        order: [['createdAt', 'DESC']],
      });

      return res.status(200).json({ data: payments });
    } catch (error) {
      console.error('Error en getPayments:', error.message);
      return res.status(500).json({ error: 'Error al obtener los pagos' });
    }
  }

  // Método para obtener un pago por ID
  static async getPaymentById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    try {
      const payment = await Payments.findByPk(id, {
        attributes: { exclude: ['createdAt', 'updatedAt'] },
      });

      if (!payment) {
        return res.status(404).json({ message: 'Pago no encontrado' });
      }

      return res.status(200).json(payment);
    } catch (error) {
      console.error('Error en getPaymentById:', error.message);
      return res.status(500).json({ message: 'Error al obtener el pago', error });
    }
  }

  // Método para procesar un pago con reintentos
  static async processPayment(req: Request, res: Response): Promise<Response> {
    const { product_id, quantity, payment_method } = req.body;

    if (!product_id || quantity <= 0 || !payment_method) {
      return res.status(400).json({ message: 'ID de producto, cantidad y método de pago son necesarios' });
    }

    const transaction = await db.transaction();

    try {
      console.log('Comenzando transacción para procesar el pago');

      const stockResponse = await PaymentController.withRetries(() =>
        axios.get(`http://localhost:4002/api/inventory/${product_id}`)
      );
      const stock = stockResponse.data;

      if (!stock) {
        return res.status(500).json({ message: 'No se pudo obtener el stock del producto' });
      }

      const productResponse = await PaymentController.withRetries(() =>
        axios.get(`http://localhost:4001/api/products/${product_id}`)
      );
      const product = productResponse.data;

      if (!product || !product.data) {
        return res.status(500).json({ message: 'No se pudo obtener la información del producto' });
      }

      if (stock.quantity < quantity) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Stock no disponible' });
      }

      const price = product.data.price;
      const total = price * quantity;

      const newPayment = await Payments.create(
        {
          product_id,
          price: total,
          payment_method,
        },
        { transaction }
      );

      await PaymentController.withRetries(() =>
        axios.put(`http://localhost:4002/api/inventory/update`, {
          product_id,
          quantity,
          input_output: 2,
        })
      );

      await transaction.commit();

      console.log('Pago procesado exitosamente');
      return res.status(201).json(newPayment);
    } catch (error) {
      await transaction.rollback();
      console.error('Error en processPayment:', error.message);
      return res.status(500).json({ message: 'Error al procesar el pago' });
    }
  }

  // Método para revertir el pago
  static async compensatePayment(req: Request, res: Response): Promise<Response> {
    const { paymentId } = req.params;

    const transaction = await db.transaction();

    try {
      // Buscar el pago en la base de datos
      const payment = await PaymentController.withRetries(() => Payments.findByPk(paymentId, { transaction }), 3);

      if (!payment) {
        await transaction.rollback(); // Revertir la transacción si no se encuentra el pago
        return res.status(404).json({ error: 'Pago no encontrado' });
      }

      // Eliminar el registro del pago
      await payment.destroy({ transaction });

      // Confirmar la transacción
      await transaction.commit();

      // Ahora solo retornamos un mensaje exitoso.
      // La compensación del inventario (reversión de stock) ya debe ser gestionada por el orquestador
      return res.json({ message: 'Pago revertido exitosamente. La compensación de inventario debe ser gestionada por el orquestador.' });
    } catch (error) {
      await transaction.rollback(); // Asegurarse de hacer rollback en caso de error
      console.error('Error al revertir el pago:', error.message);
      return res.status(500).json({ error: 'Error al revertir el pago' });
    }
  }
}

export default PaymentController;
