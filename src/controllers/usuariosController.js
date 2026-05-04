const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function listar(req, res) {
  try {
    const r = await pool.query(
      `SELECT u.id,u.nombre,u.apellido,u.email,u.telefono,u.estado,u.rol_id,r.nombre AS rol
       FROM usuarios u JOIN roles r ON u.rol_id=r.id ORDER BY u.id DESC`
    );
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, apellido, email, password, telefono, rol_id } = req.body;
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password || !rol_id)
    return res.status(400).json({ ok: false, mensaje: 'todos los campos son obligatorios' });
  if (password.length < 6)
    return res.status(400).json({ ok: false, mensaje: 'la contrasena debe tener minimo 6 caracteres' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO usuarios (nombre,apellido,email,password,telefono,rol_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,nombre,apellido,email,rol_id`,
      [nombre.trim(), apellido.trim(), email.toLowerCase().trim(), hash, telefono || null, rol_id]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, apellido, email, password, telefono, rol_id, estado } = req.body;
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !rol_id)
    return res.status(400).json({ ok: false, mensaje: 'nombre, apellido, correo y rol son obligatorios' });
  try {
    let query, params;
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ ok: false, mensaje: 'la contrasena debe tener minimo 6 caracteres' });
      const hash = await bcrypt.hash(password, 10);
      query = `UPDATE usuarios SET nombre=$1,apellido=$2,email=$3,password=$4,
               telefono=$5,rol_id=$6,estado=$7 WHERE id=$8
               RETURNING id,nombre,apellido,email,rol_id,estado`;
      params = [nombre.trim(), apellido.trim(), email.toLowerCase(), hash, telefono || null, rol_id, estado ?? true, id];
    } else {
      query = `UPDATE usuarios SET nombre=$1,apellido=$2,email=$3,
               telefono=$4,rol_id=$5,estado=$6 WHERE id=$7
               RETURNING id,nombre,apellido,email,rol_id,estado`;
      params = [nombre.trim(), apellido.trim(), email.toLowerCase(), telefono || null, rol_id, estado ?? true, id];
    }
    const r = await pool.query(query, params);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'usuario no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE usuarios SET estado = NOT estado WHERE id=$1 RETURNING *`, [id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    const pedidos = await pool.query(
      `SELECT COUNT(*) AS total FROM pedidos WHERE usuario_id=$1`, [id]
    );
    if (+pedidos.rows[0].total > 0)
      return res.status(400).json({ ok: false, mensaje: 'no se puede eliminar, tiene pedidos asociados' });
    await pool.query(`DELETE FROM usuarios WHERE id=$1`, [id]);
    res.json({ ok: true, mensaje: 'usuario eliminado' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `SELECT u.id,u.nombre,u.apellido,u.email,u.telefono,u.estado,u.rol_id,r.nombre AS rol
       FROM usuarios u JOIN roles r ON u.rol_id=r.id WHERE u.id=$1`, [id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'usuario no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle };