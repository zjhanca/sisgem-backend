require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'https://sisgem-frontend.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000'
    ]
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true)
    } else {
      callback(new Error('CORS no permitido'))
    }
  },
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use('/api/', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const multer = require('multer');
const upload = multer();
app.use('/api/ordenes', upload.any());

// ─── 1. RUTA PRINCIPAL /api ────────────────────────────
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SISGEM API',
    version: '1.0.0',
    status: 'OK'
  });
});

app.use('/api/auth',       require('./src/routes/auth'));
app.use('/api/productos',  require('./src/routes/productos'));
app.use('/api/categorias', require('./src/routes/categorias'));
app.use('/api/proveedores',require('./src/routes/proveedores'));
app.use('/api/clientes',   require('./src/routes/clientes'));
app.use('/api/pedidos',    require('./src/routes/pedidos'));
app.use('/api/pagos',      require('./src/routes/pagos'));
app.use('/api/abonos',     require('./src/routes/abonos'));
app.use('/api/ordenes',    require('./src/routes/ordenes'));
app.use('/api/domicilios', require('./src/routes/domicilios'));
app.use('/api/usuarios',   require('./src/routes/usuarios'));
app.use('/api/roles',      require('./src/routes/roles'));
app.use('/api/estados',    require('./src/routes/estados'));
app.use('/api/catalogo',   require('./src/routes/catalogo'));
app.use('/api/dashboard',  require('./src/routes/dashboard'));
app.use('/api/reportes',   require('./src/routes/reportes'));
app.use('/api/marcas',     require('./src/routes/marcas'));

// ─── 2. RUTA NO ENCONTRADA 404 ────────────────────────
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'El recurso solicitado no fue encontrado.',
    status: 404
  });
});

// ─── 3. ERROR INTERNO + 401 desde middleware auth ─────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.status === 401) {
    return res.status(401).json({
      success: false,
      message: 'Se requiere autenticación para acceder a este recurso.',
      status: 401
    });
  }
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor.',
    status: 500
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`servidor sisgem corriendo en puerto ${PORT}`);
});