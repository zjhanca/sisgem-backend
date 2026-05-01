// controllers/authController.js
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
      'SELECT u.*, r.nombre AS rol FROM usuarios u JOIN roles r ON u.rol_id = r.id WHERE u.email = $1 AND u.estado = true',
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
      usuario: { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido,
        email: usuario.email, rol: usuario.rol, rol_id: usuario.rol_id }
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'error en el servidor' });
  }
}

module.exports = { login };
