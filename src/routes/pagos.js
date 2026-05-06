const router = require('express').Router();
const ctrl = require('../controllers/pagosController');
const { verificarToken } = require('../middleware/auth');
 
router.get('/',             verificarToken, ctrl.listar);
router.get('/:id',          verificarToken, ctrl.detalle);
router.post('/',            verificarToken, ctrl.crear);
router.patch('/:id/anular', verificarToken, ctrl.anular);
 
module.exports = router;
