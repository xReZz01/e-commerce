import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import Payment from '../models/Payment.model';
import { KafkaClient, Producer } from 'kafka-node';

const client = new KafkaClient({ kafkaHost: 'localhost:9092' });
const producer = new Producer(client);

class PaymentController {
    // Método para obtener todos los pagos
    static async getPayments(req: Request, res: Response): Promise<Response> {
        try {
            const payments = await Payment.findAll({
                attributes: { exclude: ['createdAt', 'updatedAt'] }, // Excluir atributos innecesarios
                order: [['createdAt', 'DESC']] // Ordenar por fecha de creación
            });
            return res.json({ data: payments });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al obtener los pagos' });
        }
    }

    // Método para procesar un pago
    static async processPayment(req: Request, res: Response): Promise<Response> {
        const { product_id, quantity, payment_method } = req.body;
        if (!product_id || quantity <= 0 || !payment_method) {
            return res.status(400).json({ message: 'La ID del producto debe ser dada, la cantidad debe ser mayor a 0, y el metodo de pago debe ser dado' });
        }

        const transaction = await db.transaction();

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
            const price = product.price;
            const total = price * quantity;

            // Crear el pago en la base de datos
            const payment = await Payment.create({
                product_id,
                quantity,
                payment_method,
                total_price: total
            }, { transaction });

            // Enviar evento a Kafka
            const paymentData = {
                product_id,
                quantity,
                payment_method,
                total_price: total
            };

            producer.send([{ topic: 'payment-topic', messages: JSON.stringify(paymentData) }], async (err, data) => {
                if (err) {
                    console.error('Error al enviar mensaje a Kafka:', err);
                    await transaction.rollback();
                    return res.status(500).json({ message: 'Error al procesar el pago' });
                } else {
                    console.log('Mensaje enviado a Kafka:', data);
                    await transaction.commit();
                    return res.status(201).json(payment);
                }
            });
        } catch (error) {
            console.error('Error al procesar el pago:', error);
            await transaction.rollback();
            return res.status(500).json({ message: 'Error al procesar el pago' });
        }
    }
}

export default PaymentController;