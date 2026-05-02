const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errores: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT u.*, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       WHERE u.email = $1 AND u.estado = true`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: 'credenciales incorrectas' });
    }

    const usuario = result.rows[0];
    const valido = await bcrypt.compare(password, usuario.password);

    if (!valido) {
      return res.status(401).json({ ok: false, mensaje: 'credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: usuario.id, rol_id: usuario.rol_id, nombre: usuario.nombre, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.json({
      ok: true,
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rol: usuario.rol,
        rol_id: usuario.rol_id
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'error en el servidor' });
  }
}

async function recuperar(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errores: errors.array() });
  }

  const { email } = req.body;

  try {
    const result = await pool.query(
      `SELECT id, nombre FROM usuarios WHERE email = $1 AND estado = true`,
      [email]
    );

    // siempre respondemos igual para no revelar si el email existe
    if (result.rows.length === 0) {
      return res.json({ ok: true, mensaje: 'si el correo existe recibiras instrucciones' });
    }

    const usuario = result.rows[0];

    // generamos token temporal de 30 minutos
    const token = jwt.sign(
      { id: usuario.id, tipo: 'recuperar' },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    // en produccion aqui envias el email con nodemailer
    // por ahora retornamos el token para pruebas
    res.json({
      ok: true,
      mensaje: 'si el correo existe recibiras instrucciones',
      // quitar en produccion:
      debug_token: process.env.NODE_ENV === 'development' ? token : undefined
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'error en el servidor' });
  }
}

async function cambiarPassword(req, res) {
  const { token, nueva_password } = req.body;

  if (!token || !nueva_password) {
    return res.status(400).json({ ok: false, mensaje: 'token y nueva contrasena requeridos' });
  }

  if (nueva_password.length < 6) {
    return res.status(400).json({ ok: false, mensaje: 'la contrasena debe tener minimo 6 caracteres' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.tipo !== 'recuperar') {
      return res.status(403).json({ ok: false, mensaje: 'token invalido' });
    }

    const hash = await bcrypt.hash(nueva_password, 10);

    await pool.query(
      `UPDATE usuarios SET password = $1 WHERE id = $2`,
      [hash, decoded.id]
    );

    res.json({ ok: true, mensaje: 'contrasena actualizada correctamente' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ ok: false, mensaje: 'el enlace expiro, solicita uno nuevo' });
    }
    res.status(500).json({ ok: false, mensaje: 'error en el servidor' });
  }
}

module.exports = { login, recuperar, cambiarPassword };