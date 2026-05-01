// routes/productos.js
const router = require('express').Router();
const ctrl = require('../controllers/productosController');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { body } = require('express-validator');

const validar = [
  body('nombre').trim().notEmpty().withMessage('el nombre es obligatorio'),
  body('precio').isDecimal().withMessage('precio invalido'),
  body('stock').isInt({ min: 0 }).withMessage('stock invalido'),
];

router.get('/',           verificarToken, ctrl.listar);
router.post('/',          verificarToken, soloAdmin, validar, ctrl.crear);
router.put('/:id',        verificarToken, soloAdmin, validar, ctrl.actualizar);
router.patch('/:id/estado', verificarToken, soloAdmin, ctrl.toggleEstado);

module.exports = router;
