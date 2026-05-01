const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, mensaje: 'token requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, mensaje: 'token invalido o expirado' });
  }
}

function soloAdmin(req, res, next) {
  if (req.usuario.rol_id !== 1) {
    return res.status(403).json({ ok: false, mensaje: 'acceso solo para administradores' });
  }
  next();
}

module.exports = { verificarToken, soloAdmin };
