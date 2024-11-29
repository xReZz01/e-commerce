import { Request, Response } from 'express';
import Stock from '../models/Inventory.model';
import db from '../config/db';
import cache from 'memory-cache';

class InventoryController {
    // Obtener todos los registros de inventario
    static async getAllStocks(req: Request, res: Response): Promise<Response> {
        try {
            // Buscar en cache todos los registros de inventario
            const cacheKey = 'allStocks';
            const cachedStocks = cache.get(cacheKey);

            if (cachedStocks) {
                return res.status(200).json(cachedStocks);
            }

            // Si no hay cache, lo busca en la base de datos y lo agrega en cache
            const stocks = await Stock.findAll();
            cache.put(cacheKey, stocks, 60000); // Cache por 60 segundos
            return res.status(200).json(stocks);
        } catch (error) {
            return res.status(500).json({ message: 'Error al obtener datos del inventario', error });
        }
    }

    // Método para obtener stock por ID de producto
    static async getStockByProductId(req: Request, res: Response): Promise<Response> {
        const { product_id } = req.params;
        try {
            // Busca en cache el stock por product_id
            const cacheKey = `stock_${product_id}`;
            const cachedStock = cache.get(cacheKey);

            if (cachedStock) {
                return res.status(200).json(cachedStock);
            }

            const stock = await Stock.findOne({ where: { product_id } });
            if (!stock) {
                return res.status(404).json({ message: 'Stock no encontrado' });
            }

            // Agrega el stock en cache
            cache.put(cacheKey, stock, 60000); // Cache por 60 segundos
            return res.status(200).json(stock);
        } catch (error) {
            return res.status(500).json({ message: 'Error al obtener stock', error });
        }
    }

    // Agregar nuevo registro de inventario
    static async addStock(req: Request, res: Response): Promise<Response> {
        // Verificar que los datos sean válidos
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

                // Actualizar el caché
                cache.put(`stock_${product_id}`, existingStock, 60000); // Cache por 60 segundos
                cache.del('allStocks');

                return res.status(200).json(existingStock);
            } else {
                // Si no existe, crear un nuevo registro
                const newStock = await Stock.create({ product_id, quantity, input_output }, { transaction });
                await transaction.commit();

                // Actualizar el caché
                cache.put(`stock_${product_id}`, newStock, 60000); // Cache por 60 segundos
                cache.del('allStocks');

                return res.status(201).json(newStock);
            }
        } catch (error) {
            await transaction.rollback();
            return res.status(500).json({ message: 'Error al agregar stock', error });
        }
    }

    // Modificar stock existente
    static async updateStock(req: Request, res: Response): Promise<Response> {
        // Verificar que los datos sean validos
        const { product_id, quantity, input_output } = req.body;
        if (!product_id || quantity <= 0 || (input_output !== 1 && input_output !== 2)) {
            return res.status(400).json({ message: 'Datos inválidos' });
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

            // Actualizar el caché
            cache.put(`stock_${product_id}`, stock, 60000); // Cache por 60 segundos
            cache.del('allStocks');

            return res.status(200).json(stock);
        } catch (error) {
            await transaction.rollback();
            return res.status(500).json({ message: 'Error al modificar stock', error });
        }
    }
}

export default InventoryController;
