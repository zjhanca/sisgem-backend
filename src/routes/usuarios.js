const router = require('express').Router();
const ctrl = require('../controllers/usuariosController');
const { verificarToken, soloAdmin } = require('../middleware/auth');

router.get('/',             verificarToken, soloAdmin, ctrl.listar);
router.get('/:id',          verificarToken, soloAdmin, ctrl.detalle);
router.post('/',            verificarToken, soloAdmin, ctrl.crear);
router.put('/:id',          verificarToken, soloAdmin, ctrl.actualizar);
router.patch('/:id/estado', verificarToken, soloAdmin, ctrl.toggleEstado);
router.delete('/:id',       verificarToken, soloAdmin, ctrl.eliminar);

module.exports = router;