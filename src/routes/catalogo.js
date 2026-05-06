const router = require('express').Router();
const ctrl = require('../controllers/catalogoController');
const { verificarToken } = require('../middleware/auth');
 
// rutas publicas (sin auth)
router.get('/',            ctrl.listar);
router.get('/categorias',  ctrl.categorias);
router.get('/marcas',      ctrl.marcas);
router.get('/:id',         ctrl.detalle);
 
// ruta privada del cliente
router.get('/historial/mis-pedidos', verificarToken, ctrl.historialCliente);
 
module.exports = router;
