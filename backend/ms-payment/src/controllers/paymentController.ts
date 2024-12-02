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

            cache.put(cacheKey, payments, 300000);
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
            const cacheKey = `payment_${id}`;
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

            cache.put(cacheKey, payment, 300000);
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
            const cacheKey = `payment_${newPayment.id}`;
            cache.put(cacheKey, newPayment, 300000); // Cache por 5 minutos
            cache.del('allPayments'); // Invalida el caché de todos los pagos

            console.log('Pago procesado exitosamente');
            return res.status(201).json(newPayment);
        } catch (error) {
            console.error('Error en processPayment:', error.response?.data || error.message);
            await transaction.rollback();

            if (paymentId) {
                await PaymentController.compensatePayment(paymentId);
            }

            if (axios.isAxiosError(error)) {
                return res.status(500).json({ message: 'Error al procesar el pago', error: error.response?.data });
            }

            return res.status(500).json({ message: 'Error al procesar el pago', error: error.message });
        }
    }

    static async compensatePayment(paymentId: number) {
        console.log('paymentId recibido:', paymentId); // Log del valor recibido
        try {
            if (isNaN(paymentId)) {
                console.error('ID de pago no válido');
                return;
            }
    
            const url = `http://localhost:4003/api/payments/${paymentId}`;
            console.log('Revirtiendo pago con ID:', paymentId);
            
            const response = await axios.delete(url);
            
            if (response.status === 200) {
                console.log('Pago revertido exitosamente:', response.data);
            } else {
                console.error('Error al revertir el pago, código de estado:', response.status);
            }
        } catch (error: any) {
            console.error('Error al revertir el pago:', error.message);
        }
    }
}

export default PaymentController;
