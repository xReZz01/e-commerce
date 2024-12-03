import axios from 'axios';
import { Request, Response } from 'express';
import Stock from '../models/Inventory.model';
import db from '../config/db';
import cache from 'memory-cache';

class InventoryController {
    // Obtener todos los registros de inventario
    static async getAllStocks(req: Request, res: Response): Promise<Response> {
        try {
            const cacheKey = 'allStocks';
            const cachedStocks = cache.get(cacheKey);

            if (cachedStocks) {
                return res.status(200).json(cachedStocks);
            }

            const stocks = await Stock.findAll();
            cache.put(cacheKey, stocks, 120000); // cache 2 minutos
            return res.status(200).json(stocks);
        } catch (error) {
            return res.status(500).json({ message: 'Error al obtener datos del inventario', error });
        }
    }

    // Obtener stock por ID de producto
    static async getStockByProductId(req: Request, res: Response): Promise<Response> {
        const { product_id } = req.params;
        try {
            const cacheKey = `stock_${product_id}`;
            const cachedStock = cache.get(cacheKey);

            if (cachedStock) {
                return res.status(200).json(cachedStock);
            }

            const stock = await Stock.findOne({ where: { product_id } });
            if (!stock) {
                return res.status(404).json({ message: 'Stock no encontrado' });
            }

            cache.put(cacheKey, stock, 120000 ); // Cache por 2 minutos
            return res.status(200).json(stock);
        } catch (error) {
            return res.status(500).json({ message: 'Error al obtener stock', error });
        }
    }

    // Agregar nuevo registro de inventario
    static async addStock(req: Request, res: Response): Promise<Response> {
        const { product_id, quantity, input_output } = req.body;
        if (!product_id || quantity <= 0 || input_output !== 1) {
            return res.status(400).json({
                message:
                    'La ID del producto debe ser dada, la cantidad debe ser mayor a 0, y entrada/salida debe ser 1 para agregar stock',
            });
        }

        try {
            // Verificar si el producto existe en el microservicio de productos
            const productServiceUrl = `http://localhost:4001/api/products/${product_id}`;
            const productResponse = await axios.get(productServiceUrl);

            if (productResponse.status !== 200) {
                return res.status(404).json({ message: 'Producto no encontrado' });
            }

            const transaction = await db.transaction();
            try {
                const existingStock = await Stock.findOne({
                    where: { product_id, input_output: 1 },
                    transaction,
                });

                if (existingStock) {
                    existingStock.quantity += quantity;
                    await existingStock.save({ transaction });
                    await transaction.commit();

                    cache.put(`stock_${product_id}`, existingStock, 120000); // cache 2 minutos
                    cache.del('allStocks');
                    return res.status(200).json(existingStock);
                } else {
                    const newStock = await Stock.create(
                        { product_id, quantity, input_output },
                        { transaction }
                    );
                    await transaction.commit();

                    cache.put(`stock_${product_id}`, newStock, 120000); // cache 2 minutos
                    cache.del('allStocks');
                    return res.status(201).json(newStock);
                }
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                return res.status(error.response?.status || 500).json({
                    message: error.response?.data?.message || 'Error al verificar el producto',
                });
            }
            return res.status(500).json({ message: 'Error al agregar stock', error });
        }
    }

    // Modificar stock existente
    static async updateStock(req: Request, res: Response): Promise<Response> {
        const { product_id, quantity, input_output } = req.body;
        if (!product_id || quantity <= 0 || (input_output !== 1 && input_output !== 2)) {
            return res.status(400).json({ message: 'Datos inválidos' });
        }

        try {
            const productServiceUrl = `http://localhost:4001/api/products/${product_id}`;
            const productResponse = await axios.get(productServiceUrl);

            if (productResponse.status !== 200) {
                return res.status(404).json({ message: 'Producto no encontrado' });
            }

            const transaction = await db.transaction();
            try {
                const stock = await Stock.findOne({ where: { product_id }, transaction });
                if (!stock) {
                    await transaction.rollback();
                    return res.status(404).json({ message: 'Registro de stock no encontrado' });
                }

                if (input_output === 1) {
                    stock.quantity += quantity;
                } else if (input_output === 2) {
                    if (stock.quantity < quantity) {
                        await transaction.rollback();
                        return res.status(400).json({
                            message: 'Cantidad insuficiente de stock para esta salida',
                        });
                    }
                    stock.quantity -= quantity;
                }
                await stock.save({ transaction });
                await transaction.commit();

                cache.put(`stock_${product_id}`, stock, 120000); // cache 2 minutos
                cache.del('allStocks');
                return res.status(200).json(stock);
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                return res.status(error.response?.status || 500).json({
                    message: error.response?.data?.message || 'Error al verificar el producto',
                });
            }
            return res.status(500).json({ message: 'Error al modificar stock', error });
        }
    }

    // Método para revertir la compra y actualizar el stock
    static async revertPurchase(req: Request, res: Response): Promise<Response> {
        const { product_id } = req.params;
        const { quantity } = req.body;

        if (!product_id || quantity <= 0) {
            return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });
        }

        const transaction = await db.transaction();
        try {
            const stock = await Stock.findOne({ where: { product_id }, transaction });
            if (!stock) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Stock no encontrado' });
            }

            stock.quantity += quantity;
            await stock.save({ transaction });
            await transaction.commit();

            cache.put(`stock_${product_id}`, stock, 120000); // cache 2 minutos
            cache.del('allStocks');
            return res.status(200).json({ message: 'Stock actualizado exitosamente' });
        } catch (error) {
            await transaction.rollback();
            return res.status(500).json({
                message: 'Error al revertir compra y actualizar stock',
                error,
            });
        }
    }
}

export default InventoryController;
