const router = require('express').Router();
const multer = require('multer');
const ctrl = require('../controllers/ordenesController');
const { verificarToken, soloAdmin } = require('../middleware/auth');

// memoryStorage: no se guarda en disco, se lee el buffer y se convierte a base64
// en el controlador (evita depender de disco persistente en el servidor)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/',             verificarToken, ctrl.listar);
router.get('/:id',          verificarToken, ctrl.detalle);
router.post('/',            verificarToken, soloAdmin, upload.single('factura'), ctrl.crear);
router.put('/:id',          verificarToken, soloAdmin, ctrl.actualizar);
router.patch('/:id/estado', verificarToken, soloAdmin, ctrl.cambiarEstado);
router.patch('/:id/anular', verificarToken, soloAdmin, ctrl.anular);

module.exports = router;