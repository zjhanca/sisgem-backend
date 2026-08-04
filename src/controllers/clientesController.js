const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 2525,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
});

function generarPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const all   = upper + lower + nums
  let pass = upper[Math.floor(Math.random()*upper.length)]
           + nums[Math.floor(Math.random()*nums.length)]
  for (let i = 0; i < 6; i++) pass += all[Math.floor(Math.random()*all.length)]
  return pass.split('').sort(() => Math.random()-0.5).join('')
}

async function listar(req, res) {
  try {
    // deuda_fiado_actual: suma del saldo pendiente (total - pagos activos) de
    // todos los pedidos NO anulados del cliente. cupo_fiado_disponible: lo que
    // realmente le queda disponible para fiar, no solo el limite_fiado configurado.
    const r = await pool.query(`
      SELECT c.*,
        COALESCE(deuda.monto, 0) AS deuda_fiado_actual,
        CASE WHEN c.limite_fiado IS NOT NULL AND c.limite_fiado > 0
             THEN GREATEST(0, c.limite_fiado - COALESCE(deuda.monto, 0))
             ELSE NULL END AS cupo_fiado_disponible
      FROM clientes c
      LEFT JOIN (
        SELECT p.cliente_id, SUM(p.total - COALESCE(pg.pagado, 0)) AS monto
        FROM pedidos p
        LEFT JOIN estados e ON p.estado_id = e.id
        LEFT JOIN (
          SELECT pagos.pedido_id, SUM(pagos.monto) AS pagado
          FROM pagos
          LEFT JOIN estados ep ON pagos.estado_id = ep.id
          WHERE LOWER(ep.nombre) NOT LIKE '%anula%'
          GROUP BY pagos.pedido_id
        ) pg ON pg.pedido_id = p.id
        WHERE LOWER(e.nombre) NOT LIKE '%anula%'
        GROUP BY p.cliente_id
      ) deuda ON deuda.cliente_id = c.id
      ORDER BY c.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, apellido, email, telefono, tipo_documento, numero_documento, permite_fiado, limite_fiado } = req.body;
  if (!nombre?.trim() || !apellido?.trim())
    return res.status(400).json({ ok: false, mensaje: 'nombre y apellido son obligatorios' });
  if (!email?.trim())
    return res.status(400).json({ ok: false, mensaje: 'el correo es obligatorio para crear el acceso del cliente' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // crear fila en clientes
    const rc = await client.query(
      `INSERT INTO clientes (nombre,apellido,email,telefono,tipo_documento,numero_documento,permite_fiado,limite_fiado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [nombre.trim(), apellido.trim(), email.toLowerCase().trim(), telefono||null,
       tipo_documento||'CC', numero_documento||null,
       permite_fiado||false, limite_fiado||null]
    );

    // crear usuario con rol cliente si no existe ya
    const emailLower = email.toLowerCase().trim();
    const usuarioExiste = await client.query(
      'SELECT id FROM usuarios WHERE LOWER(email)=$1', [emailLower]
    );

    let password = null;
    if (!usuarioExiste.rows.length) {
      // obtener id del rol cliente
      const rolCliente = await client.query(
        "SELECT id FROM roles WHERE LOWER(nombre) LIKE '%cliente%' LIMIT 1"
      );
      const rol_id = rolCliente.rows[0]?.id;
      if (rol_id) {
        password = generarPassword();
        const hash = await bcrypt.hash(password, 10);
        await client.query(
          `INSERT INTO usuarios (nombre,apellido,email,password,telefono,rol_id,tipo_documento,numero_documento)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [nombre.trim(), apellido.trim(), emailLower, hash,
           telefono||null, rol_id, tipo_documento||'CC', numero_documento||null]
        );
      }
    }

    await client.query('COMMIT');

    // enviar correo con credenciales si se creó usuario nuevo
    let emailEnviado = false;
    if (password) {
      const loginUrl = process.env.FRONTEND_URL || 'https://sisgem-frontend.vercel.app';
      try {
        await transporter.sendMail({
          from: 'SISGEM <minimercado24123@gmail.com>',
          to: email,
          subject: 'Bienvenido a SISGEM — Tus credenciales de acceso',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e7eb">
              <h2 style="color:#1E9E50;margin:0 0 4px">SISGEM</h2>
              <p style="color:#6b7280;margin:0 0 24px;font-size:13px">Sistema de Gestión para Minimercado</p>
              <h3 style="margin:0 0 12px;font-size:16px;color:#1D3326">Hola, ${nombre.trim()} 👋</h3>
              <p style="color:#6b7280;font-size:14px;line-height:1.6">
                Tu cuenta ha sido creada en SISGEM. Aquí están tus credenciales de acceso:
              </p>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0">
                <p style="margin:0 0 8px;font-size:13px"><strong>Correo:</strong> ${emailLower}</p>
                <p style="margin:0;font-size:13px"><strong>Contraseña temporal:</strong>
                  <span style="font-family:monospace;background:#1E9E50;color:white;padding:2px 8px;border-radius:4px;margin-left:4px">${password}</span>
                </p>
              </div>
              <p style="color:#ef4444;font-size:13px;font-weight:600">Por seguridad, cambia tu contraseña después de iniciar sesión.</p>
              <div style="text-align:center;margin:24px 0">
                <a href="${loginUrl}/login" style="background:#1E9E50;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
                  Iniciar Sesión
                </a>
              </div>
            </div>
          `
        });
        emailEnviado = true;
        console.log(`[clientes.crear] Correo enviado a ${email}`);
      } catch (mailErr) {
        console.error(`[clientes.crear] Error al enviar correo a ${email}:`, mailErr.message);
      }
    }

    res.status(201).json({
      ok: true,
      datos: rc.rows[0],
      email_enviado: emailEnviado,
      ...(!emailEnviado && password && { password_temporal: password }),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, apellido, email, telefono, tipo_documento, numero_documento, estado, permite_fiado, limite_fiado } = req.body;
  try {
    const r = await pool.query(
      `UPDATE clientes SET
         nombre=$1, apellido=$2, email=$3, telefono=$4,
         tipo_documento=$5, numero_documento=$6, estado=$7,
         permite_fiado=$8, limite_fiado=$9
       WHERE id=$10 RETURNING *`,
      [nombre, apellido, email||null, telefono||null,
       tipo_documento||'CC', numero_documento||null, estado??true,
       permite_fiado||false, limite_fiado||null, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'cliente no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query('UPDATE clientes SET estado=NOT estado WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const cliente = await pool.query('SELECT * FROM clientes WHERE id=$1', [id]);
    if (!cliente.rows.length) return res.status(404).json({ ok: false, mensaje: 'cliente no encontrado' });
    const pedidos = await pool.query(`
      SELECT p.id, p.total, p.fecha_pedido, p.estado_id, e.nombre AS estado
      FROM pedidos p LEFT JOIN estados e ON p.estado_id=e.id
      WHERE p.cliente_id=$1 ORDER BY p.id DESC LIMIT 10
    `, [id]);
    res.json({ ok: true, datos: { ...cliente.rows[0], pedidos: pedidos.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function listarDirecciones(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      'SELECT * FROM direcciones_envio WHERE cliente_id=$1 AND estado=true ORDER BY id DESC', [id]
    );
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crearDireccion(req, res) {
  const { id } = req.params;
  const { direccion, barrio, indicaciones } = req.body;
  if (!direccion?.trim()) return res.status(400).json({ ok: false, mensaje: 'la direccion es obligatoria' });
  try {
    const r = await pool.query(
      `INSERT INTO direcciones_envio (cliente_id,direccion,barrio,indicaciones)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, direccion.trim(), barrio||null, indicaciones||null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    const pedidos = await pool.query('SELECT COUNT(*) AS total FROM pedidos WHERE cliente_id=$1', [id]);
    if (+pedidos.rows[0].total > 0)
      return res.status(400).json({ ok: false, mensaje: 'No se puede eliminar, el cliente tiene pedidos asociados' });
    await pool.query('DELETE FROM clientes WHERE id=$1', [id]);
    res.json({ ok: true, mensaje: 'Cliente eliminado' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, detalle, listarDirecciones, crearDireccion, eliminar };