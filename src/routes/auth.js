const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { verificarToken } = require('../middleware/auth');

router.post('/login',            ctrl.login);
router.post('/registro',         ctrl.registro);
router.get('/verificar',         ctrl.verificar);
router.post('/recuperar',        ctrl.recuperar);
router.post('/reset-password',   ctrl.resetPassword);
router.put('/cambiar-password',  verificarToken, ctrl.cambiarPassword);

module.exports = router;