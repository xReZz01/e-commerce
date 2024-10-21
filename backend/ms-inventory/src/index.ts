import colors from 'colors'
import server from "./server"

const port = process.env.PORT || 4002

server.listen(port, () => {
    console.log(colors.cyan.bold(`REST API en el puerto ${port}`))
})