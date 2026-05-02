const router = require('express').Router();
const { login, recuperar, cambiarPassword } = require('../controllers/authController');
const { body } = require('express-validator');

router.post('/login', [
  body('email').isEmail().withMessage('email invalido').normalizeEmail(),
  body('password').notEmpty().withMessage('contrasena requerida')
], login);

router.post('/recuperar', [
  body('email').isEmail().withMessage('email invalido')
], recuperar);

router.post('/cambiar-password', [
  body('token').notEmpty().withMessage('token requerido'),
  body('nueva_password').isLength({ min: 6 }).withMessage('minimo 6 caracteres')
], cambiarPassword);

module.exports = router;