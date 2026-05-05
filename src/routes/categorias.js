const router = require('express').Router();
const ctrl = require('../controllers/categoriasController');
const { verificarToken, soloAdmin } = require('../middleware/auth');

router.get('/',             ctrl.listar);
router.get('/:id',          verificarToken, ctrl.detalle);
router.post('/',            verificarToken, soloAdmin, ctrl.crear);
router.put('/:id',          verificarToken, soloAdmin, ctrl.actualizar);
router.patch('/:id/estado', verificarToken, soloAdmin, ctrl.toggleEstado);
router.delete('/:id',       verificarToken, soloAdmin, ctrl.eliminar);

module.exports = router;