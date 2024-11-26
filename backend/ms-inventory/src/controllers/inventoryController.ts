import { Request, Response } from 'express';
import Stock from '../models/Inventory.model';
import db from '../config/db';
import { KafkaClient, Consumer } from 'kafka-node';

const client = new KafkaClient({ kafkaHost: 'localhost:9092' });
const consumer = new Consumer(client, [{ topic: 'payment-topic', partition: 0 }], { autoCommit: true });

consumer.on('message', async (message) => {
    const paymentData = JSON.parse(message.value.toString());
    const { product_id, quantity } = paymentData;

    try {
        // Actualizar el inventario basado en paymentData
        const inventory = await Stock.findOne({ where: { product_id } });
        if (inventory) {
            inventory.quantity -= quantity;
            await inventory.save();
            console.log(`Inventario actualizado para el producto ${product_id}`);
        } else {
            console.error(`Producto ${product_id} no encontrado en el inventario`);
        }
    } catch (error) {
        console.error('Error al actualizar el inventario:', error);
    }
});

class InventoryController {
    // Obtener todos los registros de inventario
    static async getAllStocks(req: Request, res: Response): Promise<Response> {
        try {
            const stocks = await Stock.findAll();
            return res.status(200).json(stocks);
        } catch (error) {
            return res.status(500).json({ message: 'Error al obtener datos del inventario', error });
        }
    }

    // Método para obtener stock por ID de producto
    static async getStockByProductId(req: Request, res: Response): Promise<Response> {
        const { product_id } = req.params;
        try {
            const stock = await Stock.findOne({ where: { product_id } });
            if (!stock) {
                return res.status(404).json({ message: 'Stock no encontrado' });
            }
            return res.status(200).json(stock);
        } catch (error) {
            return res.status(500).json({ message: 'Error al obtener stock', error });
        }
    }

    // Agregar nuevo registro de inventario
    static async addStock(req: Request, res: Response): Promise<Response> {
        const { product_id, quantity, input_output } = req.body;
        if (!product_id || quantity <= 0 || input_output !== 1) {
            return res.status(400).json({ message: 'La ID del producto debe ser dada, la cantidad debe ser mayor a 0, y entrada/salida debe ser 1 para agregar stock' });
        }

        const transaction = await db.transaction();
        try {
            // Buscar si ya existe un registro para el product_id
            const existingStock = await Stock.findOne({ where: { product_id, input_output: 1 }, transaction });
            if (existingStock) {
                // Si ya existe, incrementar la quantity
                existingStock.quantity += quantity;
                await existingStock.save({ transaction });
                await transaction.commit();
                return res.status(200).json(existingStock);
            } else {
                // Si no existe, crear un nuevo registro
                const newStock = await Stock.create({ product_id, quantity, input_output }, { transaction });
                await transaction.commit();
                return res.status(201).json(newStock);
            }
        } catch (error) {
            await transaction.rollback();
            return res.status(500).json({ message: 'Error al agregar stock', error });
        }
    }

    // Modificar la quantity en el inventario
    static async updateStockQuantity(req: Request, res: Response): Promise<Response> {
        const { product_id, quantity, input_output } = req.body;
        // Validar que product_id, quantity y input_output sean válidos
        if (!product_id || quantity <= 0 || (input_output !== 1 && input_output !== 2)) {
            return res.status(400).json({ message: 'La ID del producto debe ser dada, la cantidad debe ser mayor a 0, y entrada/salida debe ser 1 (entrada) o 2 (salida)' });
        }

        const transaction = await db.transaction();
        try {
            // Buscar el stock por product_id (ignorar input_output para encontrar cualquier registro)
            const stock = await Stock.findOne({ where: { product_id }, transaction });
            if (!stock) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Registro de stock no encontrado' });
            }

            // Modificar la quantity según input_output
            if (input_output === 1) { // Entrada
                stock.quantity += quantity;
            } else if (input_output === 2) { // Salida
                if (stock.quantity < quantity) {
                    await transaction.rollback();
                    return res.status(400).json({ message: 'Cantidad insuficiente de stock para esta salida' });
                }
                stock.quantity -= quantity;
            }
            await stock.save({ transaction });
            await transaction.commit();
            return res.status(200).json(stock);
        } catch (error) {
            await transaction.rollback();
            return res.status(500).json({ message: 'Error al modificar stock', error });
        }
    }
}

export default InventoryController;
