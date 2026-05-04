const router = require('express').Router();
const ctrl = require('../controllers/estadosController');
const { verificarToken } = require('../middleware/auth');

router.get('/', verificarToken, ctrl.listar);

module.exports = router;