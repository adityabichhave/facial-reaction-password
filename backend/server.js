require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

// simple rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60
});
app.use(limiter);

const PORT = process.env.PORT || 5000;
const TEMPLATES_DIR = path.join(__dirname, 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

// AES-GCM helpers
const KEY = Buffer.from(process.env.FRP_AES_KEY_BASE64, 'base64'); // 32 bytes

function encryptJSON(obj) {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(obj));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store iv + tag + encrypted as base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptJSON(b64) {
  const data = Buffer.from(b64, 'base64');
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const encrypted = data.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// endpoints
app.post('/api/enroll', async (req, res) => {
  try {
    const { username, template } = req.body;
    if (!username || !template) return res.status(400).json({ error: 'username and template required' });
    // template can be an object (plain) or string (already encrypted). We'll always encrypt on server.
    const obj = typeof template === 'string' ? JSON.parse(template) : template;
    const ciphertext = encryptJSON(obj);
    const filename = path.join(TEMPLATES_DIR, `${encodeURIComponent(username)}.json`);
    fs.writeFileSync(filename, JSON.stringify({ data: ciphertext }), 'utf8');
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/api/template/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const filename = path.join(TEMPLATES_DIR, `${encodeURIComponent(username)}.json`);
    if (!fs.existsSync(filename)) return res.status(404).json({ error: 'not found' });
    const raw = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const decrypted = decryptJSON(raw.data);
    return res.json({ ok: true, template: decrypted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.delete('/api/template/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const filename = path.join(TEMPLATES_DIR, `${encodeURIComponent(username)}.json`);
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, () => {
  console.log(`FRP backend running at http://localhost:${PORT}`);
});
