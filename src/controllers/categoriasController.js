const pool = require('../config/db');

async function listar(req, res) {
  try {
    const r = await pool.query(`SELECT * FROM categorias ORDER BY id DESC`);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, descripcion } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  if (nombre.trim().length < 2) return res.status(400).json({ ok: false, mensaje: 'minimo 2 caracteres' });
  try {
    const existe = await pool.query(
      `SELECT id FROM categorias WHERE LOWER(nombre) = LOWER($1)`, [nombre.trim()]
    );
    if (existe.rows.length)
      return res.status(400).json({ ok: false, mensaje: 'ya existe una categoria con ese nombre' });
    const r = await pool.query(
      `INSERT INTO categorias (nombre, descripcion) VALUES ($1,$2) RETURNING *`,
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
      `UPDATE categorias SET nombre=$1, descripcion=$2, estado=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [nombre.trim(), descripcion || null, estado ?? true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'categoria no encontrada' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE categorias SET estado = NOT estado, updated_at=NOW() WHERE id=$1 RETURNING *`, [id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE productos SET categoria_id = NULL WHERE categoria_id = $1`, [id]
    );
    await pool.query(`DELETE FROM categorias WHERE id=$1`, [id]);
    res.json({ ok: true, mensaje: 'categoria eliminada' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`SELECT * FROM categorias WHERE id=$1`, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'categoria no encontrada' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle };