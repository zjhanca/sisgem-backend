const pool = require('../config/db');

async function listar(req, res) {
  try {
    const r = await pool.query(`SELECT * FROM proveedores ORDER BY id DESC`);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { tipo_persona, tipo_documento, documento, nombre, contacto, telefono, email, direccion } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  if (!documento?.trim()) return res.status(400).json({ ok: false, mensaje: 'el documento es obligatorio' });
  try {
    const r = await pool.query(
      `INSERT INTO proveedores (tipo_persona,tipo_documento,documento,nombre,contacto,telefono,email,direccion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tipo_persona, tipo_documento, documento.trim(), nombre.trim(), contacto || null,
       telefono || null, email || null, direccion || null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ ok: false, mensaje: 'el documento ya existe' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { tipo_persona, tipo_documento, documento, nombre, contacto, telefono, email, direccion, estado } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  try {
    const r = await pool.query(
      `UPDATE proveedores SET tipo_persona=$1,tipo_documento=$2,documento=$3,nombre=$4,
       contacto=$5,telefono=$6,email=$7,direccion=$8,estado=$9 WHERE id=$10 RETURNING *`,
      [tipo_persona, tipo_documento, documento, nombre.trim(), contacto || null,
       telefono || null, email || null, direccion || null, estado ?? true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'proveedor no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE proveedores SET estado = NOT estado WHERE id=$1 RETURNING *`, [id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM proveedores WHERE id=$1`, [id]);
    res.json({ ok: true, mensaje: 'proveedor eliminado' });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ ok: false, mensaje: 'no se puede eliminar, tiene productos asociados' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`SELECT * FROM proveedores WHERE id=$1`, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'proveedor no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle };