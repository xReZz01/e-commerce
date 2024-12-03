import { Request, Response } from "express";
import { Transaction } from "sequelize";
import Product from "../models/Product.model";
import db from "../config/db";
import Redis from "ioredis";

// Configuración de Redis
const redis = new Redis({
  host: "redis",
  port: 6379,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

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
        const cachedProducts = await redis.get("allProducts");
        if (cachedProducts) {
          console.log("Productos obtenidos del caché de Redis");
          return JSON.parse(cachedProducts);
        }
        const products = await Product.findAll({
          order: [["id", "DESC"]],
          attributes: { exclude: ["createdAt", "updatedAt"] },
        });
        await redis.set("allProducts", JSON.stringify(products), "EX", 120); // Cache por 2 minutos
        console.log("Productos obtenidos de la base de datos");
        return products;
      });
      return res.json({ data: result });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Error al obtener los productos" });
    }
  }

  // Obtener producto por ID con reintentos
  static async getProductById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const result = await ProductController.withRetries(async () => {
        const cacheKey = `product_${id}`;
        const cachedProduct = await redis.get(cacheKey);
        if (cachedProduct) {
          console.log("Producto obtenido del caché de Redis");
          return JSON.parse(cachedProduct);
        }
        const product = await Product.findByPk(id, {
          attributes: { exclude: ["createdAt", "updatedAt"] },
        });
        if (product) {
          await redis.set(cacheKey, JSON.stringify(product), "EX", 120); // Cache por 2 minutos
          console.log("Producto obtenido de la base de datos");
        }
        return product;
      });
      if (result) {
        return res.json({ data: result });
      } else {
        return res.status(404).json({ error: "Producto no encontrado" });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Error al obtener el producto" });
    }
  }

  // Crear un producto con reintentos y verificación de nombre único
  static async createProduct(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.body;

      // Verificar si ya existe un producto con el mismo nombre
      const existingProduct = await Product.findOne({ where: { name } });
      if (existingProduct) {
        return res.status(400).json({ error: "Ya existe un producto con este nombre" });
      }

      const result = await ProductController.withRetries(async () => {
        const transaction: Transaction = await db.transaction();
        try {
          // Crear el nuevo producto
          const product = await Product.create(req.body, { transaction });

          // Limpiar el caché
          await redis.del("allProducts");

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
      return res.status(500).json({ error: "Error al crear el producto" });
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
            throw new Error("Producto no encontrado");
          }
          await product.update(req.body, { transaction });
          await transaction.commit();

          // Actualizar el caché
          await redis.set(`product_${id}`, JSON.stringify(product), "EX", 120);
          await redis.del("allProducts");
          console.log(`Producto ${id} actualizado`);
          return product;
        } catch (error) {
          await transaction.rollback();
          throw error;
        }
      });
      return res.json({ data: result });
    } catch (error) {
      const statusCode = error.message === "Producto no encontrado" ? 404 : 500;
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
            throw new Error("Producto no encontrado");
          }
          product.activate = !product.dataValues.activate;
          await product.save({ transaction });
          await transaction.commit();

          // Actualizar el caché
          await redis.set(`product_${id}`, JSON.stringify(product), "EX", 120);
          await redis.del("allProducts");
          console.log(`Producto ${id} activado/desactivado`);
          return product;
        } catch (error) {
          await transaction.rollback();
          throw error;
        }
      });
      return res.json({ data: result });
    } catch (error) {
      const statusCode = error.message === "Producto no encontrado" ? 404 : 500;
      console.error(error);
      return res.status(statusCode).json({ error: error.message });
    }
  }
}

export default ProductController;