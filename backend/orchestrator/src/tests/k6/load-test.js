import http from 'k6/http';
import { check, sleep } from 'k6';

// Para correr test: k6 run .\load-test.js

export let options = {
  stages: [
    { duration: '10s', target: 50 }, // Incrementa gradualmente a 50 usuarios en 10 segundos
    { duration: '20s', target: 50 }, // Mantén a 50 usuarios durante 20 segundos
    { duration: '10s', target: 0 },  // Reduce a 0 usuarios durante 10 segundos
  ],
};

export default function () {
  const url = 'http://localhost:4000/api/order';
  
  // Datos para la compra (producto con stock insuficiente)
  const payload = JSON.stringify({
    product_id: 1, 
    quantity: 1,  // Suponiendo que la cantidad es mayor al stock disponible
    payment_method: 'credit_card',
    mailing_address: 'mi casa',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Enviar la solicitud POST para procesar el pago
  const response = http.post(url, payload, params);

  // Verificar los estados esperados
  check(response, {
    'is status 200 (success)': (r) => r.status === 200,  // Espera 200 si la compra es exitosa
    'is status 400 (insufficient stock)': (r) => r.status === 400,  // Espera 400 si no hay stock
    'is status 500 (server error)': (r) => r.status === 500,  // Espera 500 en caso de error del servidor
  });

  // Logs para identificar los errores en detalle
  if (response.status === 500) {
    console.error(`Server error: ${response.body}`);
  } else if (response.status === 400) {
    console.log(`Insufficient stock or bad request: ${response.body}`);
  }

  sleep(0.02); // Simula aproximadamente 50 solicitudes por segundo
}
