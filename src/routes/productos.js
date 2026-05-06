const router = require('express').Router();
const ctrl = require('../controllers/productosController');
const { verificarToken, soloAdmin } = require('../middleware/auth');
 
router.get('/',                verificarToken, ctrl.listar);
router.get('/barcode/:codigo', verificarToken, ctrl.buscarPorCodigo);
router.post('/',               verificarToken, soloAdmin, ctrl.crear);
router.put('/:id',             verificarToken, soloAdmin, ctrl.actualizar);
router.patch('/:id/estado',    verificarToken, soloAdmin, ctrl.toggleEstado);
router.delete('/:id',          verificarToken, soloAdmin, ctrl.eliminar);
 
module.exports = router;
