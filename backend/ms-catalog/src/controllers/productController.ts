import { Request, Response } from "express";
import { Transaction } from "sequelize";
import Product from "../models/Product.model";
import db from "../config/db";
import cache from 'memory-cache';

class ProductController {
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

    // Obtener todos los productos con reintentos
    static async getProducts(req: Request, res: Response): Promise<Response> {
        try {
            const result = await ProductController.withRetries(async () => {
                const cachedProducts = cache.get('allProducts');
                if (cachedProducts) {
                    console.log("Productos obtenidos del caché");
                    return cachedProducts;
                }
                const products = await Product.findAll({
                    order: [['id', 'DESC']],
                    attributes: { exclude: ['createdAt', 'updatedAt'] },
                });
                cache.put('allProducts', products, 120000); // Cache por 2 minutos
                console.log("Productos obtenidos de la base de datos");
                return products;
            });
            return res.json({ data: result });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al obtener los productos' });
        }
    }

    // Obtener producto por ID con reintentos
    static async getProductById(req: Request, res: Response): Promise<Response> {
        try {
            const { id } = req.params;
            
            // Verificar si la ID proporcionada es válida
            if (!id || isNaN(Number(id))) {
                return res.status(400).json({ error: 'ID de producto no válida' });
            }

            const result = await ProductController.withRetries(async () => {
                // Intentar recuperar el producto desde el caché
                const cachedProduct = cache.get(`product_${id}`);
                if (cachedProduct) {
                    console.log(`Producto ${id} obtenido del caché`);
                    return cachedProduct; // Si existe en caché, devolverlo
                }

                // Si no existe en caché, consultar la base de datos
                const product = await Product.findByPk(id);
                if (!product) {
                    throw new Error('Producto no encontrado');
                }

                // Almacenar el producto en caché 
                cache.put(`product_${id}`, product, 120000); // Cache 2 minutos 
                console.log(`Producto ${id} obtenido de la base de datos`);
                return product;
            });
            return res.json({ data: result });
        } catch (error) {
            // Manejo de error con mensajes claros
            if (error.message === 'Producto no encontrado') {
                return res.status(404).json({ error: 'Producto no encontrado con la ID proporcionada' });
            }
            console.error(error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // Crear un producto con reintentos y verificación de nombre único
    static async createProduct(req: Request, res: Response): Promise<Response> {
        try {
            const { name } = req.body;

            // Verificar si ya existe un producto con el mismo nombre
            const existingProduct = await Product.findOne({ where: { name } });
            if (existingProduct) {
                return res.status(400).json({ error: 'Ya existe un producto con este nombre' });
            }

            const result = await ProductController.withRetries(async () => {
                const transaction: Transaction = await db.transaction();
                try {
                    // Crear el nuevo producto
                    const product = await Product.create(req.body, { transaction });
                    
                    // Limpiar el caché
                    cache.del('allProducts');
                    
                    await transaction.commit();
                    console.log("Producto creado");
                    return product;
                } catch (error) {
                    await transaction.rollback();
                    throw error;
                }
            });

            return res.status(201).json({ data: result });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al crear el producto' });
        }
    }

    // Actualizar un producto existente con reintentos
    static async updateProduct(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        try {
            const result = await ProductController.withRetries(async () => {
                const transaction: Transaction = await db.transaction();
                try {
                    const product = await Product.findByPk(id, { transaction });
                    if (!product) {
                        throw new Error('Producto no encontrado');
                    }
                    await product.update(req.body, { transaction });
                    await transaction.commit();
                    console.log(`Producto ${id} actualizado`);
                    return product;
                } catch (error) {
                    await transaction.rollback();
                    throw error;
                }
            });
            return res.json({ data: result });
        } catch (error) {
            const statusCode = error.message === 'Producto no encontrado' ? 404 : 500;
            console.error(error);
            return res.status(statusCode).json({ error: error.message });
        }
    }

    // Activar/desactivar producto con reintentos
    static async updateActivate(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        try {
            const result = await ProductController.withRetries(async () => {
                const transaction: Transaction = await db.transaction();
                try {
                    const product = await Product.findByPk(id, { transaction });
                    if (!product) {
                        throw new Error('Producto no encontrado');
                    }
                    product.activate = !product.dataValues.activate;
                    await product.save({ transaction });
                    await transaction.commit();
                    console.log(`Producto ${id} activado/desactivado`);
                    return product;
                } catch (error) {
                    await transaction.rollback();
                    throw error;
                }
            });
            return res.json({ data: result });
        } catch (error) {
            const statusCode = error.message === 'Producto no encontrado' ? 404 : 500;
            console.error(error);
            return res.status(statusCode).json({ error: error.message });
        }
    }
}

export default ProductController;
