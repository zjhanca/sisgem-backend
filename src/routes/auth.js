// routes/auth.js
const router = require('express').Router();
const { login, recuperar } = require('../controllers/authController');
const { body } = require('express-validator');

router.post('/login', [
  body('email').isEmail().withMessage('email invalido').normalizeEmail(),
  body('password').notEmpty().withMessage('contrasena requerida')
], login);

router.post('/recuperar', [
  body('email').isEmail().withMessage('email invalido')
], recuperar);

module.exports = router;
