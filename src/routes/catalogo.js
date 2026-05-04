const router = require('express').Router();
const ctrl = require('../controllers/catalogoController');
const { verificarToken, soloAdmin } = require('../middleware/auth');

router.get('/',             ctrl.listar);
router.post('/',            verificarToken, soloAdmin, ctrl.agregarAlCatalogo);
router.patch('/:id/toggle', verificarToken, soloAdmin, ctrl.togglePublicado);

module.exports = router;