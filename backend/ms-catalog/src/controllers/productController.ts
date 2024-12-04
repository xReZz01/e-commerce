import { Request, Response } from "express"; // Importa las interfaces Request y Response de Express para manejar peticiones y respuestas HTTP.
import { Transaction } from "sequelize"; // Importa la clase Transaction de Sequelize para manejar transacciones en la base de datos.
import Product from "../models/Product.model"; // Importa el modelo Product, que representa una tabla en la base de datos.
import db from "../config/db"; // Importa la configuración de la base de datos.

class ProductController {
  
  // Método auxiliar para intentar ejecutar una acción con reintentos en caso de fallo.
  static async withRetries(action: () => Promise<any>, retries: number = 3): Promise<any> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return await action(); // Intenta ejecutar la acción.
      } catch (error) {
        attempt++; // Incrementa el contador de intentos si hay un error.
        if (attempt >= retries) {
          throw error; // Lanza el error si se alcanzan los intentos máximos.
        }
      }
    }
  }

  // Controlador para obtener todos los productos.
  static async getProducts(req: Request, res: Response): Promise<Response> {
    try {
      const result = await ProductController.withRetries(async () => {
        // Obtiene todos los productos de la base de datos, excluyendo las columnas createdAt y updatedAt.
        const products = await Product.findAll({
          order: [["id", "DESC"]], // Ordena por ID en orden descendente.
          attributes: { exclude: ["createdAt", "updatedAt"] },
        });
        console.log("Productos obtenidos de la base de datos");
        return products; // Devuelve los productos obtenidos.
      });
      return res.json({ data: result }); // Responde con los datos obtenidos.
    } catch (error) {
      console.error(error); // Loguea el error en la consola.
      return res.status(500).json({ error: "Error al obtener los productos" }); // Responde con un error 500.
    }
  }

  // Controlador para obtener un producto por su ID.
  static async getProductById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params; // Obtiene el ID del producto desde los parámetros de la URL.
      const result = await ProductController.withRetries(async () => {
        // Busca el producto por su ID, excluyendo columnas no necesarias.
        const product = await Product.findByPk(id, {
          attributes: { exclude: ["createdAt", "updatedAt"] },
        });
        if (product) {
          console.log("Producto obtenido de la base de datos");
        }
        return product; // Devuelve el producto si se encuentra.
      });
      if (result) {
        return res.json({ data: result }); // Responde con el producto encontrado.
      } else {
        return res.status(404).json({ error: "Producto no encontrado" }); // Responde con un error 404 si no existe.
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Error al obtener el producto" });
    }
  }

  // Controlador para crear un producto nuevo.
  static async createProduct(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.body; // Obtiene el nombre del producto desde el cuerpo de la petición.

      // Verifica si ya existe un producto con el mismo nombre.
      const existingProduct = await Product.findOne({ where: { name } });
      if (existingProduct) {
        return res.status(400).json({ error: "Ya existe un producto con este nombre" });
      }

      const result = await ProductController.withRetries(async () => {
        const transaction: Transaction = await db.transaction(); // Inicia una transacción.
        try {
          const product = await Product.create(req.body, { transaction }); // Crea el producto.
          await transaction.commit(); // Confirma la transacción.
          console.log("Producto creado");
          return product;
        } catch (error) {
          await transaction.rollback(); // Revierte la transacción en caso de error.
          throw error;
        }
      });

      return res.status(201).json({ data: result }); // Responde con el producto creado.
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Error al crear el producto" });
    }
  }

  // Controlador para actualizar un producto.
  static async updateProduct(req: Request, res: Response): Promise<Response> {
    const { id } = req.params; // Obtiene el ID del producto desde los parámetros de la URL.
    try {
      const result = await ProductController.withRetries(async () => {
        const transaction: Transaction = await db.transaction(); // Inicia una transacción.
        try {
          const product = await Product.findByPk(id, { transaction }); // Busca el producto por su ID.
          if (!product) {
            throw new Error("Producto no encontrado"); // Lanza un error si no existe.
          }
          await product.update(req.body, { transaction }); // Actualiza el producto con los nuevos datos.
          await transaction.commit(); // Confirma la transacción.
          console.log(`Producto ${id} actualizado`);
          return product;
        } catch (error) {
          await transaction.rollback(); // Revierte la transacción en caso de error.
          throw error;
        }
      });
      return res.json({ data: result }); // Responde con el producto actualizado.
    } catch (error) {
      const statusCode = error.message === "Producto no encontrado" ? 404 : 500; // Determina el código de estado según el error.
      console.error(error);
      return res.status(statusCode).json({ error: error.message });
    }
  }

  // Controlador para activar o desactivar un producto.
  static async updateActivate(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    try {
      const result = await ProductController.withRetries(async () => {
        const transaction: Transaction = await db.transaction(); // Inicia una transacción.
        try {
          const product = await Product.findByPk(id, { transaction }); // Busca el producto por su ID.
          if (!product) {
            throw new Error("Producto no encontrado");
          }
          product.activate = !product.dataValues.activate; // Invierte el estado de activación del producto.
          await product.save({ transaction }); // Guarda los cambios.
          await transaction.commit(); // Confirma la transacción.
          console.log(`Producto ${id} activado/desactivado`);
          return product;
        } catch (error) {
          await transaction.rollback(); // Revierte la transacción en caso de error.
          throw error;
        }
      });
      return res.json({ data: result }); // Responde con el producto actualizado.
    } catch (error) {
      const statusCode = error.message === "Producto no encontrado" ? 404 : 500;
      console.error(error);
      return res.status(statusCode).json({ error: error.message });
    }
  }
}

export default ProductController; // Exporta la clase para su uso en otras partes de la aplicación.
