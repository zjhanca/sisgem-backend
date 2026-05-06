const router = require('express').Router();
const ctrl = require('../controllers/clientesController');
const { verificarToken } = require('../middleware/auth');
 
router.get('/',                        verificarToken, ctrl.listar);
router.get('/:id',                     verificarToken, ctrl.detalle);
router.post('/',                       verificarToken, ctrl.crear);
router.put('/:id',                     verificarToken, ctrl.actualizar);
router.patch('/:id/estado',            verificarToken, ctrl.toggleEstado);
router.get('/:id/direcciones',         verificarToken, ctrl.listarDirecciones);
router.post('/:id/direcciones',        verificarToken, ctrl.crearDireccion);
 
module.exports = router;
