import express from 'express'
import colors from 'colors'
import router from './router'
import db from './config/db'

// conectar bd
async function connectDb(){
    try {
        await db.authenticate()
        db.sync()
        console.log(colors.bgGreen.white('Conexion exitosa a la base de datos'))
    } catch (error) {
        console.log(error)
        console.log(colors.bgRed.white('Error al conectar la base de datos'))
    }
}
connectDb()

// Instancia de express
const server = express()

//Leer datos de formularios
server.use(express.json())
server.use('/api/purchases', router)

export default server