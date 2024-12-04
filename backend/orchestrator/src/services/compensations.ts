import axios from 'axios';

// Función de saga para la compensación
const compensateSaga = async (paymentId: number, purchaseId: number, product_id: number, quantity: number) => {
  try {
    // Primero, intenta revertir el pago
    const paymentResponse = await axios.delete(`http://localhost:4003/api/payments/${paymentId}`);
    if (paymentResponse.status !== 200) {
      throw new Error('Error al revertir el pago');
    }

    // Luego, intenta revertir el inventario
    const inventoryResponse = await axios.put(`http://localhost:4002/api/inventory/revert/${product_id}`, { quantity });
    if (inventoryResponse.status !== 200) {
      throw new Error('Error al revertir el inventario');
    }

    // Finalmente, intenta revertir la compra
    const purchaseResponse = await axios.delete(`http://localhost:4004/api/purchases/${purchaseId}`);
    if (purchaseResponse.status !== 200) {
      throw new Error('Error al revertir la compra');
    }

  } catch (error) {
    console.error('Error en la saga de compensación:', error.message);
    throw error; // Re-lanzar el error para que la lógica de compensación falle
  }
};

export default compensateSaga;
