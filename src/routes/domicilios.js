const router = require('express').Router();
const ctrl = require('../controllers/domiciliosController');
const { verificarToken } = require('../middleware/auth');

router.get('/tarifas',          verificarToken, ctrl.listarTarifas);
router.post('/tarifas',         verificarToken, ctrl.crearTarifa);
router.put('/tarifas/:id',      verificarToken, ctrl.actualizarTarifa);
router.delete('/tarifas/:id',   verificarToken, ctrl.eliminarTarifa);
router.get('/',                 verificarToken, ctrl.listar);
router.post('/',                verificarToken, ctrl.crear);
router.patch('/:id/estado',     verificarToken, ctrl.cambiarEstado);

module.exports = router;