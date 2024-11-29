import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import Payments from '../models/Payment.model';
import cache from 'memory-cache';

class PaymentController {
    // Método para obtener todos los pagos
    static async getPayments(req: Request, res: Response): Promise<Response> {
        try {
            // Verificar si los pagos están en caché
            const cacheKey = 'allPayments';
            const cachedPayments = cache.get(cacheKey);

            if (cachedPayments) {
                return res.status(200).json({ data: cachedPayments });
            }

            // Obtener los pagos de la base de datos si no está en caché
            const payments = await Payments.findAll({
                attributes: { exclude: ['createdAt', 'updatedAt'] }, // Excluir atributos innecesarios
                order: [['createdAt', 'DESC']] // Ordenar por fecha de creación
            });

            // Agregar en caché
            cache.put(cacheKey, payments, 60000); // Cache por 60 segundos
            return res.json({ data: payments });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al obtener los pagos' });
        }
    }

    // Método para obtener un pago por ID
    static async getPaymentById(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        try {
            // Buscar en caché
            const cacheKey = `payment_${id}`;
            const cachedPayment = cache.get(cacheKey);

            if (cachedPayment) {
                return res.status(200).json(cachedPayment);
            }

            // Si no está en caché, buscar en la base de datos
            const payment = await Payments.findByPk(id, {
                attributes: { exclude: ['createdAt', 'updatedAt'] } // Excluir atributos innecesarios
            });

            if (!payment) {
                return res.status(404).json({ message: 'Pago no encontrado' });
            }

            // Agregar a caché
            cache.put(cacheKey, payment, 60000); // Cache por 60 segundos
            return res.status(200).json(payment);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Error al obtener el pago', error });
        }
    }

    // Método para procesar un pago
    static async processPayment(req: Request, res: Response): Promise<Response> {
        const { product_id, quantity, payment_method } = req.body;
        if (!product_id || quantity <= 0 || !payment_method) {
            return res.status(400).json({ message: 'La ID del producto debe ser dada, la cantidad debe ser mayor a 0, y el metodo de pago debe ser dado' });
        }

        const transaction = await db.transaction();
        let paymentId;

        try {
            // Verificar stock del producto
            const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
            const stock = stockResponse.data;
            const productResponse = await axios.get(`http://localhost:4001/api/products/${product_id}`);
            const product = productResponse.data;

            if (!stock || stock.quantity < quantity) {
                await transaction.rollback();
                return res.status(400).json({ message: 'No hay suficiente stock disponible' });
            }

            // Calcular el precio total
            const price = product.data.price;
            const total = price * quantity;

            // Crear el registro de pago
            const newPayment = await Payments.create({
                product_id: product_id,
                price: total,
                payment_method: payment_method
            }, { transaction });

            paymentId = newPayment.id;

            // Descontar la cantidad del stock
            try {
                await axios.put(`http://localhost:4002/api/inventory/update`, {
                    product_id,
                    quantity,
                    input_output: 2 // 2 indica una salida (descuento del stock)
                });
            } catch (error) {
                console.error('Error al actualizar el inventario:', error);
                await transaction.rollback();
                await PaymentController.compensatePayment(paymentId); // Revertir pago en caso de error
                if (axios.isAxiosError(error)) {
                    return res.status(500).json({ message: 'Error al actualizar el inventario', error: error.response?.data });
                }
                return res.status(500).json({ message: 'Error al actualizar el inventario' });
            }

            await transaction.commit();

            // Actualizar el caché
            const cacheKey = `payment_${newPayment.id}`;
            cache.put(cacheKey, newPayment, 60000); // Cache por 60 segundos
            cache.del('allPayments'); // Invalida el caché de todos los pagos

            return res.status(201).json(newPayment);
        } catch (error) {
            console.error('Error al procesar el pago:', error);
            await transaction.rollback();
            if (paymentId) {
                await PaymentController.compensatePayment(paymentId); // Revertir pago si ya se creó
            }
            if (axios.isAxiosError(error)) {
                return res.status(500).json({ message: 'Error al procesar el pago', error: error.response?.data });
            }
            return res.status(500).json({ message: 'Error al procesar el pago', error: error.message });
        }
    }

    // Función de compensación del pago
    static async compensatePayment(paymentId: number) {
        try {
            await axios.delete(`http://localhost:4003/api/payments/${paymentId}`);
            console.log('Pago revertido');
        } catch (error) {
            console.error('Error al revertir el pago:', error);
        }
    }
}

export default PaymentController;