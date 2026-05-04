const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');
const { verificarToken } = require('../middleware/auth');

router.get('/',           verificarToken, ctrl.estadisticas);
router.get('/ventas-mes', verificarToken, ctrl.ventasMes);
router.get('/ventas-semana', verificarToken, ctrl.ventasSemana);

module.exports = router;