const { Kafka } = require('kafkajs')

const kafka = new Kafka({
  clientId: 'e-commerce-client', // ID único para tu cliente
  brokers: ['kafka:9092'], // Broker de Kafka (utiliza el nombre del contenedor Kafka o la IP)
})

const consumer = kafka.consumer({ groupId: 'test-group' }) // 'test-group' es el nombre del grupo de consumidores

async function consumeMessages() {
  // Conectar al consumidor
  await consumer.connect()

  // Suscribirse al topic 'test-topic' (puedes cambiarlo por el topic que estás utilizando)
  await consumer.subscribe({ topic: 'test-topic', fromBeginning: true })

  // Empezar a consumir los mensajes
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      // Este código se ejecutará cada vez que llegue un mensaje al topic
      console.log(`Recibido mensaje: ${message.value.toString()}`) // Aquí puedes procesar el mensaje recibido
    },
  })
}

consumeMessages().catch(console.error)