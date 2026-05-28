const router = require('express').Router();
const ctrl = require('../controllers/authController');

router.post('/login',    ctrl.login);
router.post('/registro', ctrl.registro);
router.get('/verificar', ctrl.verificar);

module.exports = router;