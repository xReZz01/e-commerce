import { Request, Response } from "express";
import { Transaction } from "sequelize";
import Product from "../models/Product.model";
import db from "../config/db";

class ProductController {
    // Obtener todos los productos
    static async getProducts(req: Request, res: Response): Promise<Response> {
        try {
            const products = await Product.findAll({
                order: [['id', 'DESC']],
                attributes: { exclude: ['createdAt', 'updatedAt'] }
            });
            return res.json({ data: products });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al obtener los productos' });
        }
    }

    // Obtener un producto por ID
    static async getProductById(req: Request, res: Response): Promise<Response> {
        try {
            const { id } = req.params;
            const product = await Product.findByPk(id);
            if (!product) {
                return res.status(404).json({ error: 'Producto no encontrado' });
            }
            return res.json({ data: product });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al obtener el producto' });
        }
    }

    // Crear un nuevo producto
    static async createProduct(req: Request, res: Response): Promise<Response> {
        const transaction: Transaction = await db.transaction();
        try {
            const product = await Product.create(req.body, { transaction });
            await transaction.commit();
            return res.json({ data: product });
        } catch (error) {
            await transaction.rollback();
            console.error(error);
            return res.status(500).json({ error: 'Error al crear el producto' });
        }
    }

    // Actualizar un producto existente
    static async updateProduct(req: Request, res: Response): Promise<Response> {
        const transaction: Transaction = await db.transaction();
        try {
            const { id } = req.params;
            const product = await Product.findByPk(id, { transaction });
            if (!product) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Producto no encontrado' });
            }
            await product.update(req.body, { transaction });
            await transaction.commit();
            return res.json({ data: product });
        } catch (error) {
            await transaction.rollback();
            console.error(error);
            return res.status(500).json({ error: 'Error al actualizar el producto' });
        }
    }

    // Activar/desactivar un producto
    static async updateActivate(req: Request, res: Response): Promise<Response> {
        const transaction: Transaction = await db.transaction();
        try {
            const { id } = req.params;
            const product = await Product.findByPk(id, { transaction });
            if (!product) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Producto no encontrado' });
            }
            product.activate = !product.dataValues.activate;
            await product.save({ transaction });
            await transaction.commit();
            return res.json({ data: product });
        } catch (error) {
            await transaction.rollback();
            console.error(error);
            return res.status(500).json({ error: 'Error al actualizar el estado del producto' });
        }
    }

    // Eliminar un producto
    static async deleteProduct(req: Request, res: Response): Promise<Response> {
        const transaction: Transaction = await db.transaction();
        try {
            const { id } = req.params;
            const product = await Product.findByPk(id, { transaction });
            if (!product) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Producto no encontrado' });
            }
            await product.destroy({ transaction });
            await transaction.commit();
            return res.json({ data: product });
        } catch (error) {
            await transaction.rollback();
            console.error(error);
            return res.status(500).json({ error: 'Error al eliminar el producto' });
        }
    }
}

export default ProductController;
