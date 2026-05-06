const router = require('express').Router();
const ctrl = require('../controllers/abonosController');
const { verificarToken } = require('../middleware/auth');
 
router.get('/',             verificarToken, ctrl.listar);
router.post('/',            verificarToken, ctrl.crear);
router.patch('/:id/estado', verificarToken, ctrl.cambiarEstado);
 
module.exports = router;
