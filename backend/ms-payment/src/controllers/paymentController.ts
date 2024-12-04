import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import Payments from '../models/Payment.model';

class PaymentController {
  
  // Función genérica para realizar un intento repetido de una acción en caso de fallos temporales.
  static async withRetries(action: () => Promise<any>, retries: number = 3): Promise<any> {
    let attempt = 0; // Cuenta los intentos.
    while (attempt < retries) {
      try {
        return await action(); // Ejecuta la acción.
      } catch (error) {
        attempt++; 
        if (attempt >= retries) {
          throw error; // Lanza el error si se superan los intentos permitidos.
        }
      }
    }
  }

  // Obtiene todos los registros de pagos almacenados en la base de datos.
  static async getPayments(req: Request, res: Response): Promise<Response> {
    try {
      const payments = await Payments.findAll({
        attributes: { exclude: ['createdAt', 'updatedAt'] }, // Excluye atributos innecesarios.
        order: [['createdAt', 'DESC']],
      });

      return res.status(200).json({ data: payments }); // Devuelve los pagos encontrados.
    } catch (error) {
      console.error('Error en getPayments:', error.message); 
      return res.status(500).json({ error: 'Error al obtener los pagos' }); // Respuesta en caso de error.
    }
  }

  // Obtiene un pago específico por su ID.
  static async getPaymentById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params; // Obtiene el ID del pago desde los parámetros de la ruta.
    try {
      const payment = await Payments.findByPk(id, {
        attributes: { exclude: ['createdAt', 'updatedAt'] }, // Excluye atributos innecesarios.
      });

      if (!payment) {
        return res.status(404).json({ message: 'Pago no encontrado' }); // Devuelve error si el pago no existe.
      }

      return res.status(200).json(payment); // Devuelve el pago encontrado.
    } catch (error) {
      console.error('Error en getPaymentById:', error.message); // Log del error.
      return res.status(500).json({ message: 'Error al obtener el pago', error }); // Respuesta en caso de error.
    }
  }

  // Procesa un nuevo pago y actualiza el stock asociado al producto comprado.
  static async processPayment(req: Request, res: Response): Promise<Response> {
    const { product_id, quantity, payment_method } = req.body; // Extrae los datos necesarios del cuerpo de la solicitud.

    if (!product_id || quantity <= 0 || !payment_method) { // Valida los datos ingresados.
      return res.status(400).json({ message: 'ID de producto, cantidad y método de pago son necesarios' });
    }

    const transaction = await db.transaction(); // Inicia una transacción para garantizar la consistencia.

    try {
      console.log('Comenzando transacción para procesar el pago');

      // Verifica la disponibilidad de stock del producto.
      const stockResponse = await PaymentController.withRetries(() =>
        axios.get(`http://localhost:4002/api/inventory/${product_id}`)
      );
      const stock = stockResponse.data;

      if (!stock) {
        return res.status(500).json({ message: 'No se pudo obtener el stock del producto' });
      }

      // Obtiene los detalles del producto.
      const productResponse = await PaymentController.withRetries(() =>
        axios.get(`http://localhost:4001/api/products/${product_id}`)
      );
      const product = productResponse.data;

      if (!product || !product.data) {
        return res.status(500).json({ message: 'No se pudo obtener la información del producto' });
      }
      // Verifica si hay stock suficiente y revierte la transacción si no hay stock suficiente.
      if (stock.quantity < quantity) { 
        await transaction.rollback(); 
        return res.status(400).json({ message: 'Stock no disponible' });
      }
      // Calculo del precio total
      const price = product.data.price; 
      const total = price * quantity; 

      // Crea un registro del pago en la base de datos.
      const newPayment = await Payments.create(
        {
          product_id,
          price: total,
          payment_method,
        },
        { transaction }
      );

      // Actualiza el stock del producto (reducción de stock).
      await PaymentController.withRetries(() =>
        axios.put(`http://localhost:4002/api/inventory/update`, {
          product_id,
          quantity,
          input_output: 2, // Indica salida de stock.
        })
      );

      await transaction.commit(); // Confirma la transacción.
      console.log('Pago procesado exitosamente');
      return res.status(201).json(newPayment); // Devuelve el pago creado.
    } catch (error) {
      await transaction.rollback(); // Revierte la transacción en caso de error.
      console.error('Error en processPayment:', error.message); 
      return res.status(500).json({ message: 'Error al procesar el pago' }); 
    }
  }

  // Reversa un pago existente eliminando el registro asociado.
  static async compensatePayment(req: Request, res: Response): Promise<Response> {
    const { paymentId } = req.params; // Obtiene el ID del pago desde los parámetros de la ruta.

    const transaction = await db.transaction(); // Inicia una transacción.

    try {
      // Busca el pago por su ID con múltiples intentos.
      const payment = await PaymentController.withRetries(() => Payments.findByPk(paymentId, { transaction }), 3);

      if (!payment) {
        await transaction.rollback(); // Revierte la transacción si no encuentra el pago.
        return res.status(404).json({ error: 'Pago no encontrado' });
      }

      await payment.destroy({ transaction }); // Elimina el registro del pago.

      await transaction.commit(); // Confirma la transacción.

      // Devuelve un mensaje de éxito, indicando que el inventario debe ser gestionado externamente.
      return res.json({ message: 'Pago revertido exitosamente. La compensación de inventario debe ser gestionada por el orquestador.' });
    } catch (error) {
      await transaction.rollback(); // Revierte la transacción en caso de error.
      console.error('Error al revertir el pago:', error.message); 
      return res.status(500).json({ error: 'Error al revertir el pago' }); 
    }
  }
}

export default PaymentController; // Exporta la clase para su uso en otros módulos.
