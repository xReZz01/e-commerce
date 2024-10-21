import { Request, Response } from 'express';
import axios from 'axios';
import Payment from '../models/Payment.model';

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

        try {
            // Verificar stock del producto
            const stockResponse = await axios.get(`http://localhost:4002/api/inventory/${product_id}`);
            const stock = stockResponse.data;

            const productResponse = await axios.get(`http://localhost:4000/api/products/${product_id}`);
            const product = productResponse.data;

            if (!stock || stock.quantity < quantity) {
                return res.status(400).json({ message: 'No hay suficiente stock disponible' });
            }

            // Calcular el precio total
            const price = product.data.price;
            const total = price * quantity;

            // Crear el registro de pago
            const newPayment = await Payment.create({
                product_id: product_id,
                price: total,
                payment_method: payment_method
            });

            // Descontar la quantity del stock
            await axios.put(`http://localhost:4002/api/inventory/update`, {
                product_id,
                quantity,
                entrada_salida: 2 // 2 indica una salida 
            });

            return res.status(201).json(newPayment);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                return res.status(500).json({ message: 'Error al obtener stock', error: error.response?.data });
            }
            return res.status(500).json({ message: 'Error al procesar pago', error });
        }
    }
}

export default PaymentController;
