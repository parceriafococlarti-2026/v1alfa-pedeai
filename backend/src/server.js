// Importa o express
const express = require('express')

// Importa o cors
const cors = require('cors')

// Lê o .env
require('dotenv').config()

// Cria o app ← ANTES de usar
const app = express()

// Permite JSON no body
app.use(express.json())

// Libera acesso externo
app.use(cors())

// Importa as rotas
const authRoutes = require('./routes/authRoutes')

// Rota de teste
app.get('/ping', (req, res) => {
  res.json({ message: 'Servidor rodando 🚀' })
})

// Rotas de autenticação
app.use('/auth', authRoutes)

// Porta do servidor
const PORT = process.env.PORT || 3000

// Sobe o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})