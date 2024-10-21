import { Request, Response } from "express";
import Product from "../models/Product.model";

class ProductController {
    // Obtener todos los productos
    static async getProducts(req: Request, res: Response): Promise<Response> {
        try {
            const products = await Product.findAll({
                order: [['name', 'DESC']],
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
        try {
            const product = await Product.create(req.body);
            return res.json({ data: product });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error al crear el producto' });
        }
    }

    // Actualizar un producto existente
    static async updateProduct(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const product = await Product.findByPk(id);

        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        await product.update(req.body);
        await product.save();

        return res.json({ data: product });
    }

    // Activar/desactivar un producto
    static async updateActivate(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const product = await Product.findByPk(id);

        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        product.activate = !product.dataValues.activate;
        await product.save();

        return res.json({ data: product });
    }

    // Eliminar un producto
    static async deleteProduct(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const product = await Product.findByPk(id);

        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        await product.destroy();
        return res.json({ data: product });
    }
}

export default ProductController;
