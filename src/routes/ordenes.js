const router = require('express').Router();
const ctrl = require('../controllers/ordenesController');
const { verificarToken, soloAdmin } = require('../middleware/auth');

// nota: el parseo del archivo 'factura' ya lo hace el middleware global
// `upload.any()` montado en index.js sobre '/api/ordenes' — no agregar
// otro multer aquí, porque consumiría el stream dos veces y rompe el form.
router.get('/',             verificarToken, ctrl.listar);
router.get('/:id',          verificarToken, ctrl.detalle);
router.post('/',            verificarToken, soloAdmin, ctrl.crear);
router.put('/:id',          verificarToken, soloAdmin, ctrl.actualizar);
router.patch('/:id/estado', verificarToken, soloAdmin, ctrl.cambiarEstado);
router.patch('/:id/anular', verificarToken, soloAdmin, ctrl.anular);

module.exports = router;