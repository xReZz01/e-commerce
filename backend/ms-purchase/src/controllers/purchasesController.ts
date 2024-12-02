import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db'; 
import Purchase from '../models/Purchase.model';
import cache from 'memory-cache';

class PurchaseController {
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

    // Método para obtener todas las compras
    static async getPurchases(req: Request, res: Response): Promise<Response> {
        try {
            // Buscar en cache
            const cacheKey = 'allPurchases';
            const cachedPurchases = cache.get(cacheKey);

            if (cachedPurchases) {
                return res.status(200).json(cachedPurchases);
            }

            // Si no esta en cache, buscar en la base de datos
            const purchases = await Purchase.findAll();
            cache.put(cacheKey, purchases, 300000); // Cache por 5 minutos
            return res.status(200).json(purchases);
        } catch (error) {
            console.error('Error al obtener compras'); // Solo mensaje general
            return res.status(500).json({ message: 'Error al obtener compras' });
        }
    }

    // Método estático para crear una compra
    static async createPurchase(req: Request, res: Response): Promise<Response> {
        const { product_id, mailing_address } = req.body;
        const purchase_date = new Date();

        const transaction = await db.transaction();

        try {
            // Usar reintentos para obtener información del producto
            const product = await PurchaseController.withRetries(() => axios.get(`http://localhost:4001/api/products/${product_id}`), 3)
                .then(response => response.data.data)
                .catch(() => null);

            if (!product) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Producto no encontrado' });
            }

            // Guardar la compra en la base de datos
            const purchase = await Purchase.create({ product_id, purchase_date, mailing_address }, { transaction });

            await transaction.commit();

            // Actualizar el caché
            cache.del('allPurchases'); // Invalida el caché de todas las compras

            return res.json({ message: 'Compra creada', purchase });
        } catch (error) {
            await transaction.rollback();
            console.error('Error al crear la compra'); // Solo mensaje general
            return res.status(500).json({ error: 'Error al crear la compra' });
        }
    }

    // Método para revertir una compra
    static async rollbackPurchase(req: Request, res: Response): Promise<Response> {
        const { purchase_id } = req.body;

        const transaction = await db.transaction();

        try {
            const purchase = await PurchaseController.withRetries(() => Purchase.findByPk(purchase_id, { transaction }), 3);

            if (!purchase) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Compra no encontrada' });
            }

            await purchase.destroy({ transaction });
            await transaction.commit();

            // Actualizar el caché
            cache.del('allPurchases'); // Invalida el caché de todas las compras

            return res.json({ message: 'Compra revertida' });
        } catch (error) {
            await transaction.rollback();
            console.error('Error al revertir la compra'); // Solo mensaje general
            return res.status(500).json({ error: 'Error al revertir la compra' });
        }
    }
}

export default PurchaseController;
