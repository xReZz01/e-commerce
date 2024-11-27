const { Kafka } = require('kafkajs')

const kafka = new Kafka({
  clientId: 'e-commerce-client',
  brokers: ['kafka:9092'],
})

const consumer = kafka.consumer({ groupId: 'test-group' })

async function consumeMessages() {
  await consumer.connect()
  await consumer.subscribe({ topic: 'test-topic', fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log({
        value: message.value.toString(),
      })
    },
  })
}

consumeMessages().catch(console.error)