require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// rutas activas
app.use('/api/auth', require('./src/routes/auth'));

// rutas pendientes - descomentar cuando crees los archivos
// app.use('/api/usuarios',   require('./src/routes/usuarios'));
// app.use('/api/roles',      require('./src/routes/roles'));
// app.use('/api/categorias', require('./src/routes/categorias'));
// app.use('/api/proveedores',require('./src/routes/proveedores'));
// app.use('/api/productos',  require('./src/routes/productos'));
// app.use('/api/catalogo',   require('./src/routes/catalogo'));
// app.use('/api/clientes',   require('./src/routes/clientes'));
// app.use('/api/pedidos',    require('./src/routes/pedidos'));
// app.use('/api/pagos',      require('./src/routes/pagos'));
// app.use('/api/abonos',     require('./src/routes/abonos'));
// app.use('/api/domicilios', require('./src/routes/domicilios'));
// app.use('/api/ordenes',    require('./src/routes/ordenes'));
// app.use('/api/reportes',   require('./src/routes/reportes'));
// app.use('/api/estados',    require('./src/routes/estados'));
// app.use('/api/dashboard',  require('./src/routes/dashboard'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, mensaje: 'error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`servidor sisgem corriendo en puerto ${PORT}`);
});