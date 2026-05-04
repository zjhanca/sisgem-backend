const pool = require('../config/db');

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT c.id, c.imagen, c.publicado,
             p.id AS producto_id, p.nombre, p.descripcion,
             p.precio, p.stock, p.categoria_id,
             cat.nombre AS categoria
      FROM catalogo c
      JOIN productos p ON c.producto_id = p.id
      LEFT JOIN categorias cat ON p.categoria_id = cat.id
      WHERE c.publicado = true AND p.estado = true AND p.stock > 0
      ORDER BY c.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function togglePublicado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE catalogo SET publicado = NOT publicado WHERE id=$1 RETURNING *`, [id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function agregarAlCatalogo(req, res) {
  const { producto_id, imagen } = req.body;
  if (!producto_id) return res.status(400).json({ ok: false, mensaje: 'producto requerido' });
  try {
    const existe = await pool.query(
      `SELECT id FROM catalogo WHERE producto_id=$1`, [producto_id]
    );
    if (existe.rows.length)
      return res.status(400).json({ ok: false, mensaje: 'el producto ya esta en el catalogo' });
    const r = await pool.query(
      `INSERT INTO catalogo (producto_id, publicado, imagen) VALUES ($1, true, $2) RETURNING *`,
      [producto_id, imagen || null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, togglePublicado, agregarAlCatalogo };