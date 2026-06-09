const pool = require('../config/db');
 
async function listar(req, res) {
  const { categoria_id, marca_id, busqueda, destacados } = req.query;
  try {
    let query = `
      SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, p.imagen_url, p.imagenes,
             c.nombre AS categoria, m.nombre AS marca, m.logo AS marca_logo,
             p.estado
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id=c.id
      LEFT JOIN marcas m ON p.marca_id=m.id
      WHERE p.estado=true AND p.stock > 0
    `;
    const params = [];
    if (categoria_id) { params.push(categoria_id); query += ` AND p.categoria_id=$${params.length}`; }
    if (marca_id)     { params.push(marca_id);     query += ` AND p.marca_id=$${params.length}`; }
    if (busqueda) {
      params.push(`%${busqueda}%`);
      query += ` AND (p.nombre ILIKE $${params.length} OR p.descripcion ILIKE $${params.length})`;
    }
    query += ' ORDER BY p.id DESC';
    const r = await pool.query(query, params);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre AS categoria, m.nombre AS marca, m.logo AS marca_logo
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id=c.id
      LEFT JOIN marcas m ON p.marca_id=m.id
      WHERE p.id=$1 AND p.estado=true
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'producto no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function categorias(req, res) {
  try {
    const r = await pool.query(`
      SELECT c.*, COUNT(p.id) AS total_productos
      FROM categorias c
      LEFT JOIN productos p ON p.categoria_id=c.id AND p.estado=true AND p.stock > 0
      WHERE c.estado=true
      GROUP BY c.id HAVING COUNT(p.id) > 0
      ORDER BY c.nombre
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function marcas(req, res) {
  try {
    const r = await pool.query(`
      SELECT m.*, COUNT(p.id) AS total_productos
      FROM marcas m
      LEFT JOIN productos p ON p.marca_id=m.id AND p.estado=true AND p.stock > 0
      WHERE m.estado=true
      GROUP BY m.id HAVING COUNT(p.id) > 0
      ORDER BY m.nombre
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function historialCliente(req, res) {
  const cliente_id = req.usuario.cliente_id || req.params.cliente_id;
  try {
    const pedidos = await pool.query(`
      SELECT p.*, e.nombre AS estado
      FROM pedidos p LEFT JOIN estados e ON p.estado_id=e.id
      WHERE p.cliente_id=$1 ORDER BY p.id DESC
    `, [cliente_id]);
 
    const resultado = [];
    for (const ped of pedidos.rows) {
      const prods = await pool.query(`
        SELECT pp.*, pr.nombre AS producto, pr.imagen_url
        FROM pedido_productos pp JOIN productos pr ON pp.producto_id=pr.id
        WHERE pp.pedido_id=$1
      `, [ped.id]);
      resultado.push({ ...ped, productos: prods.rows });
    }
    res.json({ ok: true, datos: resultado });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, detalle, categorias, marcas, historialCliente };