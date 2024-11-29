import { Request, Response } from "express";
import { Transaction } from "sequelize";
import Product from "../models/Product.model";
import db from "../config/db";
import cache from 'memory-cache';

class ProductController {
    // Obtener todos los productos
    static async getProducts(req: Request, res: Response): Promise<Response> {
        try {
            // Buscar en cache todos los productos
            const cachedProducts = cache.get('allProducts');
            if (cachedProducts) {
                return res.json({ data: cachedProducts });
            }

            // Filtros
            const products = await Product.findAll({
                order: [['id', 'DESC']],
                attributes: { exclude: ['createdAt', 'updatedAt'] }
            });

            // Si no encuentra en cache, traerlo desde la base de datos y almacenarlo en cache
            cache.put('allProducts', products, 60000); // Cache por 60 segundos
            return res.json({ data: products });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al obtener los productos' });
        }
    }

    // Obtener un producto por ID
    static async getProductById(req: Request, res: Response): Promise<Response> {
        try {
            // Buscamos en cache el producto por ID
            const { id } = req.params;
            const cachedProduct = cache.get(`product_${id}`);
            if (cachedProduct) {
                return res.json({ data: cachedProduct });
            }

            // Si no encuentra en cache, traerlo desde la base de datos y almacenarlo en cache
            const product = await Product.findByPk(id);
            if (!product) {
                return res.status(404).json({ error: 'Producto no encontrado' });
            }

            // Almacenar en cache
            cache.put(`product_${id}`, product, 60000); // Cache por 60 segundos
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
            // Crear producto
            const product = await Product.create(req.body, { transaction });
            // Limpiar caché después de crear un nuevo producto
            cache.del('allProducts');
            await transaction.commit();
            return res.status(201).json({ data: product });
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
            // Buscar producto a modificar
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
            // Buscar producto a activar/desactivar
            const { id } = req.params;
            const product = await Product.findByPk(id, { transaction });
            if (!product) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Producto no encontrado' });
            }
            // Cambiar estado del producto
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
}

export default ProductController;
