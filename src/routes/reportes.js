const router = require('express').Router()
const { verificarToken } = require('../middleware/auth')
const ctrl = require('../controllers/reportesController')

router.get('/ventas',                   verificarToken, ctrl.reporteVentas)
router.get('/productos',                verificarToken, ctrl.reporteProductos)
router.get('/clientes',                 verificarToken, ctrl.reporteClientes)
router.get('/pedidos',                  verificarToken, ctrl.reportePedidos)
router.get('/pagos',                    verificarToken, ctrl.reportePagos)
router.get('/pagos/pedido/:id',         verificarToken, ctrl.comprobantePagosPedido)
router.get('/pagos/pedido/:id/tirilla', verificarToken, ctrl.comprobantePagosPedidoTirilla)
router.get('/ordenes',                  verificarToken, ctrl.reporteOrdenes)
router.get('/ordenes/:id',              verificarToken, ctrl.comprobanteOrden)
router.get('/domicilios',               verificarToken, ctrl.reporteDomicilios)
router.get('/proveedores',              verificarToken, ctrl.reporteProveedores)
router.get('/pedido/:id',               verificarToken, ctrl.comprobantePedido)
router.get('/pedido/:id/tirilla',       verificarToken, ctrl.comprobantePedidoTirilla)

module.exports = router