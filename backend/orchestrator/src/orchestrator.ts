import axios from 'axios';

interface PurchaseRequest {
    productId: string;
    userId: string;
    paymentDetails: any;
}

export async function orchestrateTransaction(purchaseRequest: PurchaseRequest) {
    const { productId, userId, paymentDetails } = purchaseRequest;

    try {
        // Step 1: Check product availability
        const productResponse = await axios.get(`http://ms-catalogo:3001/products/${productId}`);
        const product = productResponse.data;

        if (!product || !product.available) {
            throw new Error('Product not available');
        }

        // Step 2: Persist purchase data
        const purchaseResponse = await axios.post('http://ms-compras:3002/purchases', {
            productId,
            userId
        });
        const purchase = purchaseResponse.data;

        // Step 3: Process payment
        const paymentResponse = await axios.post('http://ms-pagos:3003/payments', {
            purchaseId: purchase.id,
            paymentDetails
        });
        const payment = paymentResponse.data;

        // Step 4: Update inventory
        await axios.post('http://ms-inventario:3004/inventory', {
            productId,
            quantity: -1
        });

        return { message: 'Purchase completed successfully', purchase, payment };
    } catch (error) {
        // Handle errors and rollback if necessary
        if (error instanceof Error) {
            throw new Error(`Transaction failed: ${error.message}`);
        } else {
            throw new Error('Transaction failed: Unknown error');
        }
    }
}