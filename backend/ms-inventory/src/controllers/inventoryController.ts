import axios from 'axios';
import { Request, Response } from 'express';
import Stock from '../models/Inventory.model';
import db from '../config/db';

class InventoryController {
  // Obtener todos los registros de inventario
  static async getAllStocks(req: Request, res: Response): Promise<Response> {
    try {
      const stocks = await Stock.findAll();
      return res.status(200).json(stocks);
    } catch (error) {
      console.error('Error al obtener datos del inventario:', error.message);
      return res.status(500).json({ message: 'Error al obtener datos del inventario', error });
    }
  }

  // Obtener stock por ID de producto
  static async getStockByProductId(req: Request, res: Response): Promise<Response> {
    const { product_id } = req.params;
    try {
      const stock = await Stock.findOne({ where: { product_id } });
      if (!stock) {
        return res.status(404).json({ message: 'Stock no encontrado' });
      }
      return res.status(200).json(stock);
    } catch (error) {
      console.error('Error al obtener stock:', error.message);
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

        let updatedStock;
        if (existingStock) {
          existingStock.quantity += quantity;
          updatedStock = await existingStock.save({ transaction });
        } else {
          updatedStock = await Stock.create(
            { product_id, quantity, input_output },
            { transaction }
          );
        }
        await transaction.commit();
        return res.status(existingStock ? 200 : 201).json(updatedStock);
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
        const updatedStock = await stock.save({ transaction });
        await transaction.commit();
        return res.status(200).json(updatedStock);
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

  // Revertir compra y actualizar stock
  static async revertPurchase(req: Request, res: Response): Promise<Response> {
    const { product_id } = req.params; // ID del producto
    const { quantity } = req.body; // Cantidad a revertir
    
    if (!product_id || quantity <= 0) {
      return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });
    }
  
    const transaction = await db.transaction();
    try {
      // Buscar el stock actual del producto
      const stock = await Stock.findOne({ where: { product_id }, transaction });
      if (!stock) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Stock no encontrado' });
      }

      // Validar que la cantidad a revertir no exceda la reducción realizada previamente
      const previousReduction = await Stock.findOne({
        where: {
          product_id,
          input_output: 2, // Indica que fue una salida previa
        },
        transaction,
      });

      if (!previousReduction || previousReduction.quantity < quantity) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'No hay suficientes registros de reducción para revertir esta cantidad',
        });
      }

      // Ajustar el stock incrementando la cantidad
      stock.quantity += quantity;
  
      // Registrar la operación como "reversión" (entrada de stock)
      const revertLog = await Stock.create(
        {
          product_id,
          quantity,
          input_output: 1, // Indica que es una entrada (reversión de salida)
        },
        { transaction }
      );
  
      // Guardar el stock actualizado
      const updatedStock = await stock.save({ transaction });
      await transaction.commit();
  
      return res.status(200).json({
        message: 'Stock revertido exitosamente',
        updatedStock,
        revertLog,
      });
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
