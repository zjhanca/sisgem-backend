const router = require('express').Router();
const ctrl = require('../controllers/rolesController');
const { verificarToken, soloAdmin } = require('../middleware/auth');
 
router.get('/permisos',         verificarToken, soloAdmin, ctrl.listarPermisos);
router.get('/',                 verificarToken, ctrl.listar);
router.get('/:id',              verificarToken, ctrl.detalle);
router.post('/',                verificarToken, soloAdmin, ctrl.crear);
router.post('/:id/permisos',    verificarToken, soloAdmin, ctrl.asignarPermisos);
router.put('/:id',              verificarToken, soloAdmin, ctrl.actualizar);
router.patch('/:id/estado',     verificarToken, soloAdmin, ctrl.toggleEstado);
router.delete('/:id',           verificarToken, soloAdmin, ctrl.eliminar);
 
module.exports = router;
