// Cloudflare R2 helper — usa SDK S3 compatível
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const REQUIRED = ['R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET'];
const missing = REQUIRED.filter(k => !process.env[k]);

let client = null;
const enabled = missing.length === 0;

if (!enabled) {
  console.warn(`[r2] R2 desabilitado — envs faltando: ${missing.join(', ')}`);
} else {
  client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
}

const BUCKET = process.env.R2_BUCKET;
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');

/**
 * Upload de áudio. Retorna URL pública.
 * @param {Buffer} buffer
 * @param {string} id  ex: nanoid(12)
 * @param {string} contentType ex: 'audio/mp4'
 */
async function uploadAudio(buffer, id, contentType = 'audio/mp4') {
  if (!enabled) throw new Error('R2 não configurado');
  const key = `comments/${id}.m4a`;
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  if (!PUBLIC_BASE) {
    // Sem domain público configurado — devolve só a key, frontend resolve depois
    return { url: null, key };
  }
  return { url: `${PUBLIC_BASE}/${key}`, key };
}

async function deleteAudio(key) {
  if (!enabled) return;
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { uploadAudio, deleteAudio, enabled };
