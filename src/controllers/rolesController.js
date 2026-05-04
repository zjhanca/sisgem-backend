const pool = require('../config/db');

async function listar(req, res) {
  try {
    const r = await pool.query(`SELECT * FROM roles ORDER BY id`);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, descripcion } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  if (nombre.trim().length < 2) return res.status(400).json({ ok: false, mensaje: 'minimo 2 caracteres' });
  try {
    const existe = await pool.query(
      `SELECT id FROM roles WHERE LOWER(nombre) = LOWER($1)`, [nombre.trim()]
    );
    if (existe.rows.length)
      return res.status(400).json({ ok: false, mensaje: 'ya existe un rol con ese nombre' });
    const r = await pool.query(
      `INSERT INTO roles (nombre,descripcion) VALUES ($1,$2) RETURNING *`,
      [nombre.trim(), descripcion || null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, estado } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  try {
    const r = await pool.query(
      `UPDATE roles SET nombre=$1,descripcion=$2,estado=$3 WHERE id=$4 RETURNING *`,
      [nombre.trim(), descripcion || null, estado ?? true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'rol no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE roles SET estado = NOT estado WHERE id=$1 RETURNING *`, [id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    const usuarios = await pool.query(
      `SELECT COUNT(*) AS total FROM usuarios WHERE rol_id=$1`, [id]
    );
    if (+usuarios.rows[0].total > 0)
      return res.status(400).json({ ok: false, mensaje: 'no se puede eliminar, tiene usuarios asignados' });
    await pool.query(`DELETE FROM roles_permisos WHERE rol_id=$1`, [id]);
    await pool.query(`DELETE FROM roles WHERE id=$1`, [id]);
    res.json({ ok: true, mensaje: 'rol eliminado' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`SELECT * FROM roles WHERE id=$1`, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'rol no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle };