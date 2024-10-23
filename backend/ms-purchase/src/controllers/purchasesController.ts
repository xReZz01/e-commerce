import { Request, Response } from 'express';
import axios from 'axios';
import db from '../config/db'; 
import Purchase from '../models/Purchase.model';

class PurchaseController {
    // Método para obtener todas las compras
    static async getPurchases(req: Request, res: Response): Promise<Response> {
        try {
            const purchases = await Purchase.findAll();
            return res.status(200).json(purchases);
        } catch (error) {
            return res.status(500).json({ message: 'Error al obtener compras', error });
        }
    }

    // Método estático para crear una compra
    static async createPurchase(req: Request, res: Response): Promise<Response> {
        const { product_id, mailing_address } = req.body;
        const purchase_date = new Date();

        const transaction = await db.transaction();

        try {
            // Obtener información del producto
            const productResponse = await axios.get(`http://localhost:4001/api/products/${product_id}`);
            const product = productResponse.data.data;

            if (!product) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Producto no encontrado' });
            }

            // Guardar la compra en la base de datos
            const purchase = await Purchase.create({ product_id, purchase_date, mailing_address }, { transaction });

            await transaction.commit();
            return res.json({ message: 'Compra creada', purchase });
        } catch (error) {
            await transaction.rollback();
            console.error(error);
            return res.status(500).json({ error: 'Error al crear la compra' });
        }
    }
}

export default PurchaseController;