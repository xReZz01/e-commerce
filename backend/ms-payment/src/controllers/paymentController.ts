import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import Payments from '../models/Payment.model';
import cache from 'memory-cache';

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
            const cacheKey = 'allPayments';
            const cachedPayments = cache.get(cacheKey);

            if (cachedPayments) {
                console.log('Usando pagos desde el caché');
                return res.status(200).json({ data: cachedPayments });
            }

            const payments = await Payments.findAll({
                attributes: { exclude: ['createdAt', 'updatedAt'] },
                order: [['createdAt', 'DESC']],
            });

            cache.put(cacheKey, payments, 120000); // Cache 2 minutos
            console.log('Pagos obtenidos desde la base de datos');
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
            const cacheKey = `${id}`;
            const cachedPayment = cache.get(cacheKey);

            if (cachedPayment) {
                console.log('Usando pago desde el caché');
                return res.status(200).json(cachedPayment);
            }

            const payment = await Payments.findByPk(id, {
                attributes: { exclude: ['createdAt', 'updatedAt'] },
            });

            if (!payment) {
                return res.status(404).json({ message: 'Pago no encontrado' });
            }

            cache.put(cacheKey, payment, 120000); // Cache 2 minutos
            console.log('Pago obtenido desde la base de datos');
            return res.status(200).json(payment);
        } catch (error) {
            console.error('Error en getPaymentById:', error.message);
            return res.status(500).json({ message: 'Error al obtener el pago', error });
        }
    }

    // Método para procesar un pago con reintentos
    static async processPayment(req: Request, res: Response): Promise<Response> {
        const { product_id, quantity, payment_method } = req.body;

        // Validación de parámetros
        if (!product_id || quantity <= 0 || !payment_method) {
            return res.status(400).json({ message: 'ID de producto, cantidad y método de pago son necesarios' });
        }

        const transaction = await db.transaction();
        let paymentId;

        try {
            console.log('Comenzando transacción para procesar el pago');

            // Verificación del inventario del producto con reintentos
            const stockResponse = await PaymentController.withRetries(() => axios.get(`http://localhost:4002/api/inventory/${product_id}`));
            const stock = stockResponse.data;
            console.log('Stock recibido:', stock);

            if (!stock) {
                console.error('No se pudo obtener información de inventario');
                return res.status(500).json({ message: 'No se pudo obtener el stock del producto' });
            }

            // Verificación de la existencia del producto con reintentos
            const productResponse = await PaymentController.withRetries(() => axios.get(`http://localhost:4001/api/products/${product_id}`));
            const product = productResponse.data;
            console.log('Producto recibido:', product);

            if (!product || !product.data) {
                console.error('No se pudo obtener información del producto');
                return res.status(500).json({ message: 'No se pudo obtener la información del producto' });
            }

            // Verificación de stock disponible
            if (stock.quantity < quantity) {
                console.log('Stock insuficiente');
                await transaction.rollback();
                return res.status(400).json({ message: 'Stock no disponible' });
            }

            const price = product.data.price;
            const total = price * quantity;

            // Creación del pago
            const newPayment = await Payments.create({
                product_id,
                price: total,
                payment_method,
            }, { transaction });

            paymentId = newPayment.id;

            // Actualización del inventario con reintentos
            await PaymentController.withRetries(() => axios.put(`http://localhost:4002/api/inventory/update`, {
                product_id,
                quantity,
                input_output: 2, // Salida de stock
            }));

            await transaction.commit();

            // Cachear el nuevo pago y limpiar caché de pagos
            const cacheKey = `${newPayment.id}`;
            cache.put(cacheKey, newPayment, 120000); // Cache por 2 minutos
            cache.del('allPayments'); // Invalida el caché de todos los pagos

            console.log('Pago procesado exitosamente');
            return res.status(201).json(newPayment);
        } catch (error) {
            console.error('Error en processPayment:', error.response?.data || error.message);
            await transaction.rollback();

            if (axios.isAxiosError(error)) {
                return res.status(500).json({ message: 'Error al procesar el pago', error: error.response?.data });
            }

            return res.status(500).json({ message: 'Error al procesar el pago', error: error.message });
        }
    }

    // Método para revertir el pago
    static async compensatePayment(req: Request, res: Response): Promise<Response> {
        const { paymentId } = req.params;  // Cambia de `req.body` a `req.params`
    
        const transaction = await db.transaction();  // Inicia una transacción
    
        try {
            // Intentar encontrar el pago usando el ID recibido
            const payment = await PaymentController.withRetries(() => Payments.findByPk(paymentId, { transaction }), 3);
    
            if (!payment) {
                await transaction.rollback();  // Si no se encuentra el pago, revertir la transacción
                return res.status(404).json({ error: 'Pago no encontrado' });
            }
    
            // Revertir el pago (en este caso, eliminarlo)
            await payment.destroy({ transaction });
    
            await transaction.commit();  // Si todo sale bien, confirmar la transacción
    
            // Invalidate the cache for payments (similar to how you invalidate purchases)
            cache.del('allPayments'); // Invalida el caché de todos los pagos
    
            return res.json({ message: 'Pago revertido exitosamente' });
        } catch (error: any) {
            await transaction.rollback();  // En caso de error, revertir la transacción
            console.error('Error al revertir el pago:', error.message);
            return res.status(500).json({ error: 'Error al revertir el pago' });
        }
    }
    
}

export default PaymentController;
