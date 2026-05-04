const pool = require('../config/db');
const { validationResult } = require('express-validator');

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre AS categoria, pr.nombre AS proveedor
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      ORDER BY p.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ ok: false, errores: errors.array() });

  const { categoria_id, proveedor_id, nombre, descripcion, precio, stock } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO productos (categoria_id, proveedor_id, nombre, descripcion, precio, stock)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [categoria_id || null, proveedor_id || null, nombre.trim(), descripcion || null, precio, stock]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { categoria_id, proveedor_id, nombre, descripcion, precio, stock, estado } = req.body;
  try {
    const r = await pool.query(
      `UPDATE productos
       SET categoria_id=$1, proveedor_id=$2, nombre=$3, descripcion=$4,
           precio=$5, stock=$6, estado=$7
       WHERE id=$8 RETURNING *`,
      [categoria_id || null, proveedor_id || null, nombre.trim(), descripcion || null, precio, stock, estado ?? true, id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE productos SET estado = NOT estado WHERE id = $1 RETURNING *`, [id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM productos WHERE id = $1`, [id]);
    res.json({ ok: true, mensaje: 'producto eliminado' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre AS categoria, pr.nombre AS proveedor
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE p.id = $1
    `, [id]);
    if (!r.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'producto no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle };