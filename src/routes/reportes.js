const router = require('express').Router();
const { verificarToken } = require('../middleware/auth');

router.get('/ventas',     verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/productos',  verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/clientes',   verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/pedidos',    verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/pagos',      verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/ordenes',    verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/domicilios', verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/proveedores',verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));
router.get('/pedido/:id', verificarToken, (req, res) => res.json({ ok: true, mensaje: 'proximamente' }));

module.exports = router;