const router = require('express').Router();
const ctrl = require('../controllers/ordenesController');
const { verificarToken, soloAdmin } = require('../middleware/auth');

router.get('/',             verificarToken, ctrl.listar);
router.get('/:id',          verificarToken, ctrl.detalle);
router.post('/',            verificarToken, soloAdmin, ctrl.crear);
router.patch('/:id/estado', verificarToken, soloAdmin, ctrl.cambiarEstado);

module.exports = router;