const pool = require('../config/db');

async function listar(req, res) {
  try {
    const r = await pool.query(`SELECT * FROM categorias ORDER BY id DESC`);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, descripcion, margen, icono } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  if (nombre.trim().length < 2) return res.status(400).json({ ok: false, mensaje: 'minimo 2 caracteres' });
  try {
    const existe = await pool.query(
      `SELECT id FROM categorias WHERE LOWER(nombre) = LOWER($1)`, [nombre.trim()]
    );
    if (existe.rows.length)
      return res.status(400).json({ ok: false, mensaje: 'ya existe una categoria con ese nombre' });
    await pool.query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS margen NUMERIC(5,2) DEFAULT 45`);
    await pool.query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS icono VARCHAR(300)`);
    const r = await pool.query(
      `INSERT INTO categorias (nombre, descripcion, margen, icono) VALUES ($1,$2,$3,$4) RETURNING *`,
      [nombre.trim(), descripcion || null, margen !== undefined ? +margen : 45, icono || null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, estado, margen, icono } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  try {
    await pool.query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS margen NUMERIC(5,2) DEFAULT 45`);
    await pool.query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS icono VARCHAR(300)`);
    const r = await pool.query(
      `UPDATE categorias SET nombre=$1, descripcion=$2, estado=$3, margen=$4, icono=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [nombre.trim(), descripcion || null, estado ?? true, margen !== undefined ? +margen : 45, icono || null, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'categoria no encontrada' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizarMargen(req, res) {
  const { id } = req.params;
  const { margen } = req.body;
  if (margen === undefined || margen === null || isNaN(+margen) || +margen < 0)
    return res.status(400).json({ ok: false, mensaje: 'margen inválido' });
  try {
    await pool.query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS margen NUMERIC(5,2) DEFAULT 45`);
    const r = await pool.query(
      `UPDATE categorias SET margen=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [+margen, id]
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
    const productos = await pool.query('SELECT COUNT(*) AS total FROM productos WHERE categoria_id=$1', [id]);
    if (+productos.rows[0].total > 0)
      return res.status(400).json({ ok: false, mensaje: 'No se puede eliminar, la categoría tiene productos asignados' });
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

module.exports = { listar, crear, actualizar, actualizarMargen, toggleEstado, eliminar, detalle };