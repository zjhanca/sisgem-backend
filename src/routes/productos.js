const router = require('express').Router();
const ctrl = require('../controllers/productosController');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { body } = require('express-validator');

const validar = [
  body('nombre').trim().notEmpty().withMessage('el nombre es obligatorio'),
  body('precio').isDecimal({ decimal_digits: '0,2' }).withMessage('precio invalido'),
  body('stock').isInt({ min: 0 }).withMessage('stock invalido'),
];

router.get('/',             verificarToken, ctrl.listar);
router.get('/:id',          verificarToken, ctrl.detalle);
router.post('/',            verificarToken, soloAdmin, validar, ctrl.crear);
router.put('/:id',          verificarToken, soloAdmin, validar, ctrl.actualizar);
router.patch('/:id/estado', verificarToken, soloAdmin, ctrl.toggleEstado);
router.delete('/:id',       verificarToken, soloAdmin, ctrl.eliminar);

module.exports = router;