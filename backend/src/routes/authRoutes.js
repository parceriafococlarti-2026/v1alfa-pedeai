const express = require('express')
const router = express.Router()

const authController = require('../controllers/authController')

// Cadastro
router.post('/register', authController.register)

// Login
router.post('/login', authController.login)

// Debug - listar usuários (remover em produção)
router.get('/users', authController.listUsers)

module.exports = router