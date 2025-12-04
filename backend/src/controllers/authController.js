const User = require('../models/User');
const { encryptSequence, decryptSequence } = require('../utils/crypto');
const { dtwDistance } = require('../utils/dtw');
const { validateLiveness } = require('../utils/validateLiveness');

async function register(req, res) {
  const { username, sequence } = req.body;
  if (!username || !sequence) return res.status(400).json({ error: 'Missing fields' });
  if (!validateLiveness(sequence)) return res.status(400).json({ error: 'Liveness validation failed' });
  const { encrypted, iv } = encryptSequence(sequence);
  try {
    const u = new User({ username, encryptedTemplate: encrypted, iv });
    await u.save();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Database error: ' + err.message });
  }
}

async function verify(req, res) {
  const { username, sequence } = req.body;
  if (!username || !sequence) return res.status(400).json({ error: 'Missing fields' });
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const template = decryptSequence(user.encryptedTemplate, user.iv);
  if (!template) return res.status(500).json({ error: 'Decryption failed' });
  const dist = dtwDistance(sequence, template);
  const threshold = 0.15; // server-side threshold
  if (dist <= threshold) return res.json({ ok: true, score: dist });
  return res.status(401).json({ ok: false, score: dist });
}

module.exports = { register, verify };
