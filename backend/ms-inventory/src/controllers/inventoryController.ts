import axios from 'axios'; 
import { Request, Response } from 'express'; 
import Stock from '../models/Inventory.model'; 
import db from '../config/db'; 

// Clase controladora para gestionar el inventario.
class InventoryController { 

  // Obtiene todos los registros de inventario.
  static async getAllStocks(req: Request, res: Response): Promise<Response> {
    try {
      const stocks = await Stock.findAll(); // Consulta todos los registros en la base de datos devuelve los registros con código 200 (OK)
      return res.status(200).json(stocks);
    } catch (error) {
      console.error('Error al obtener datos del inventario:', error.message); 
      return res.status(500).json({ message: 'Error al obtener datos del inventario', error }); // Devuelve un error 500 si ocurre una excepción.
    }
  }

  // Obtiene el stock de un producto específico por su ID.
  static async getStockByProductId(req: Request, res: Response): Promise<Response> {
    const { product_id } = req.params; // Obtiene el ID del producto desde los parámetros de la ruta.
    try {
      const stock = await Stock.findOne({ where: { product_id } }); // Busca el registro con el ID dado.
      if (!stock) {
        return res.status(404).json({ message: 'Stock no encontrado' }); // Si no encuentra el registro, devuelve un error 404.
      }
      return res.status(200).json(stock); // Devuelve el registro encontrado con código 200 (OK).
    } catch (error) {
      console.error('Error al obtener stock:', error.message); 
      return res.status(500).json({ message: 'Error al obtener stock', error }); // Devuelve un error 500 si ocurre una excepción.
    }
  }

  // Agrega stock para un producto existente o crea un nuevo registro.
  static async addStock(req: Request, res: Response): Promise<Response> {
    const { product_id, quantity, input_output } = req.body; // Extrae los datos del cuerpo de la solicitud.
    if (!product_id || quantity <= 0 || input_output !== 1) { // Valida los datos de entrada.
      return res.status(400).json({
        message: 'La ID del producto debe ser dada, la cantidad debe ser mayor a 0, y entrada/salida debe ser 1 para agregar stock',
      });
    }

    try {
      const productServiceUrl = `http://localhost:4001/api/products/${product_id}`; // URL para verificar si el producto existe.
      const productResponse = await axios.get(productServiceUrl); // Realiza una consulta HTTP para validar el producto.

      if (productResponse.status !== 200) {
        return res.status(404).json({ message: 'Producto no encontrado' }); // Devuelve error 404 si el producto no existe.
      }

      const transaction = await db.transaction(); // Inicia una transacción para garantizar la consistencia de la base de datos.
      try {
        const existingStock = await Stock.findOne({
          where: { product_id, input_output: 1 },
          transaction, // Incluye la transacción actual.
        });

        let updatedStock;
        if (existingStock) { // Si ya existe stock, lo actualiza.
          existingStock.quantity += quantity;
          updatedStock = await existingStock.save({ transaction });
        } else { // Si no existe, crea un nuevo registro.
          updatedStock = await Stock.create(
            { product_id, quantity, input_output },
            { transaction }
          );
        }
        await transaction.commit(); // Confirma los cambios en la base de datos.
        return res.status(existingStock ? 200 : 201).json(updatedStock); // Devuelve el stock actualizado con código 200 o 201.
      } catch (error) {
        await transaction.rollback(); // Revierte los cambios en caso de error.
        throw error; 
      }
    } catch (error) {
      if (axios.isAxiosError(error)) { // Si el error proviene de la solicitud HTTP.
        return res.status(error.response?.status || 500).json({
          message: error.response?.data?.message || 'Error al verificar el producto',
        });
      }
      return res.status(500).json({ message: 'Error al agregar stock', error }); // Devuelve un error 500 si ocurre otra excepción.
    }
  }

  // Actualiza la cantidad de stock de un producto.
  static async updateStock(req: Request, res: Response): Promise<Response> {
    const { product_id, quantity, input_output } = req.body; // Extrae los datos del cuerpo de la solicitud.
    if (!product_id || quantity <= 0 || (input_output !== 1 && input_output !== 2)) { // Valida los datos.
      return res.status(400).json({ message: 'Datos inválidos' }); 
    }

    try {
      const productServiceUrl = `http://localhost:4001/api/products/${product_id}`; // Verifica si el producto existe.
      const productResponse = await axios.get(productServiceUrl); 

      if (productResponse.status !== 200) {
        return res.status(404).json({ message: 'Producto no encontrado' }); 
      }

      const transaction = await db.transaction(); // Inicia una transacción para actualizar el stock.
      try {
        const stock = await Stock.findOne({ where: { product_id }, transaction }); 
        if (!stock) { 
          await transaction.rollback();
          return res.status(404).json({ message: 'Registro de stock no encontrado' }); 
        }

        if (input_output === 1) { // Si es una entrada, incrementa el stock.
          stock.quantity += quantity; 
        } else if (input_output === 2) { // Si es una salida, valida que haya suficiente stock.
          if (stock.quantity < quantity) { 
            await transaction.rollback();
            return res.status(400).json({
              message: 'Cantidad insuficiente de stock para esta salida',
            });
          }
          stock.quantity -= quantity; // Resta el stock si es válido.
        }
        const updatedStock = await stock.save({ transaction }); // Guarda los cambios en la base de datos.
        await transaction.commit(); // Confirma la transacción.
        return res.status(200).json(updatedStock); // Devuelve el stock actualizado.
      } catch (error) {
        await transaction.rollback(); // Revierte los cambios en caso de error.
        throw error;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return res.status(error.response?.status || 500).json({
          message: error.response?.data?.message || 'Error al verificar el producto',
        });
      }
      return res.status(500).json({ message: 'Error al modificar stock', error }); // Devuelve un error 500 si ocurre otra excepción.
    }
  }

  // Revierte la reducción de stock de un producto.
  static async revertPurchase(req: Request, res: Response): Promise<Response> {
    const { product_id } = req.params; // Obtiene el ID
    const { quantity } = req.body; // Obtiene la cantidad
    
    if (!product_id || quantity <= 0) { // Valida los datos de entrada.
      return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' }); 
    }
  
    const transaction = await db.transaction(); // Inicia una transacción para revertir la compra.
    try {
      const stock = await Stock.findOne({ where: { product_id }, transaction }); 
      if (!stock) { // Verifica si existe el registro de stock.
        await transaction.rollback();
        return res.status(404).json({ message: 'Stock no encontrado' }); 
      }

      const previousReduction = await Stock.findOne({
        where: {
          product_id,
          input_output: 2, // Busca una reducción previa del producto.
        },
        transaction,
      });

      if (!previousReduction || previousReduction.quantity < quantity) { // Valida si hay suficiente reducción registrada.
        await transaction.rollback();
        return res.status(400).json({
          message: 'No hay suficientes registros de reducción para revertir esta cantidad',
        });
      }

      stock.quantity += quantity; // Incrementa la cantidad de stock.
  
      const revertLog = await Stock.create(
        {
          product_id,
          quantity,
          input_output: 1, // Registra la reversión como entrada.
        },
        { transaction }
      );
  
      const updatedStock = await stock.save({ transaction }); // Guarda el nuevo estado del stock.
      await transaction.commit(); // Confirma la transacción.
  
      return res.status(200).json({
        message: 'Stock revertido exitosamente',
        updatedStock,
        revertLog, // Devuelve tanto el stock actualizado como el registro de reversión.
      });
    } catch (error) {
      await transaction.rollback(); // Revierte la transacción en caso de error.
      return res.status(500).json({
        message: 'Error al revertir compra y actualizar stock',
        error, // Devuelve un error 500 con los detalles.
      });
    }
  }
}

// Exporta la clase controladora para usarla en las rutas.
export default InventoryController;
