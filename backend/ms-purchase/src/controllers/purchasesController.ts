import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db';
import Purchase from '../models/Purchase.model';

class PurchaseController {
  // Función que intenta ejecutar una acción con un máximo de reintentos
  static async withRetries(action: () => Promise<any>, retries: number = 3): Promise<any> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return await action(); // Intentar ejecutar la acción
      } catch (error) {
        attempt++; // Incrementar el número de intentos
        if (attempt >= retries) {
          throw error; // Lanzar el error si se alcanzan los reintentos máximos
        }
      }
    }
  }

  // Obtener todas las compras
  static async getPurchases(req: Request, res: Response): Promise<Response> {
    try {
      const purchases = await Purchase.findAll(); // Obtener todas las compras desde la base de datos

      return res.status(200).json(purchases); // Devolver las compras en formato JSON
    } catch (error) {
      console.error('Error al obtener compras:', error.message); 
      return res.status(500).json({ message: 'Error al obtener compras' }); 
    }
  }

  // Crear una nueva compra
  static async createPurchase(req: Request, res: Response): Promise<Response> {
    const { product_id, mailing_address } = req.body; // Obtener datos de la compra
    const purchase_date = new Date(); // Fecha de la compra

    const transaction = await db.transaction(); // Iniciar una transacción en la base de datos

    try {
      
      // Obtener información del producto utilizando una API externa (axios)
      const product = await PurchaseController.withRetries(() =>
        axios.get(`http://localhost:4001/api/products/${product_id}`), 3
      )
        .then(response => response.data.data) // Extraer la data del producto
        .catch(() => null); // Si hay error, devolver null

      // Verificar si el producto no fue encontrado y hacer rollback
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      
      // Crear una nueva compra en la base de datos
      const purchase = await Purchase.create(
        { product_id, purchase_date, mailing_address },
        { transaction } // Asegurarse de que la compra se haga dentro de la transacción
      );

      await transaction.commit(); // Confirmar la transacción

      return res.json({ message: 'Compra creada', purchase }); // Devolver respuesta con la compra creada
    } catch (error) {
      await transaction.rollback(); // Hacer rollback si ocurre algún error
      console.error('Error al crear la compra:', error.message);
      return res.status(500).json({ error: 'Error al crear la compra' }); 
    }
  }

  
  // Revertir una compra (rollback)
  static async rollbackPurchase(req: Request, res: Response): Promise<Response> {
    const { purchase_id } = req.params; // Obtener el ID de la compra a revertir

    const transaction = await db.transaction(); // Iniciar una transacción en la base de datos

    try {
      // Buscar la compra en la base de datos
      const purchase = await PurchaseController.withRetries(() =>
        Purchase.findByPk(purchase_id, { transaction }), 3
      );

      // Si no se encuentra la compra
      if (!purchase) {
        await transaction.rollback(); // Hacer rollback si no se encuentra la compra
        return res.status(404).json({ error: 'Compra no encontrada' }); // Devolver error
      }

      
      // Eliminar la compra de la base de datos
      await purchase.destroy({ transaction });
      await transaction.commit(); // Confirmar la transacción

      return res.json({ message: 'Compra revertida' }); // Devolver mensaje de éxito
    } catch (error) {
      await transaction.rollback(); // Hacer rollback si ocurre algún error
      console.error('Error al revertir la compra:', error.message); // Log del error
      return res.status(500).json({ error: 'Error al revertir la compra' }); // Devolver error
    }
  }
}

export default PurchaseController;
