import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1s', target: 50 },  // Incrementa rápidamente a 50 usuarios
    { duration: '10s', target: 50 }, // Mantén 50 usuarios durante 10 segundos
    { duration: '1s', target: 0 },   // Reduce a 0 usuarios
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // El 95% de las solicitudes deben completarse en menos de 500ms
    http_req_failed: ['rate<0.1'],   // Menos del 1% de fallos
  },
};

export default function () {
  const url = 'http://localhost:4000/api/order';
  const payload = JSON.stringify({
    product_id: 1, 
    quantity: 2,
    payment_method: 'credit_card',
    mailing_address: 'mi casa',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Enviar la solicitud POST
  const response = http.post(url, payload, params);

  // Verificar los estados esperados
  check(response, {
    'is status 200 (success)': (r) => r.status === 200,  // Espera 200
    'is status 400 (insufficient stock)': (r) => r.status === 400,  // Espera 400 si no hay stock
    'is status 500 (server error)': (r) => r.status === 500,  // Espera 500 en caso de error del servidor
  });

  // Logs para identificar los errores en detalle
  if (response.status === 500) {
    console.error(`Server error: ${response.body}`);
  } else if (response.status === 400) {
    console.log(`Insufficient stock or bad request: ${response.body}`);
  }

  sleep(0.02); // Simular aproximadamente 50 solicitudes por segundo
}
