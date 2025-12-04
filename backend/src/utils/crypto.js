const CryptoJS = require('crypto-js');

// AES encryption with passphrase (for demo). In prod use per-user keys and KMS.
const ENCRYPTION_KEY = process.env.JWT_SECRET || 'dev_secret_change_me';

function encryptSequence(sequence) {
  const text = JSON.stringify(sequence);
  const iv = CryptoJS.lib.WordArray.random(16).toString();
  const encrypted = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY, { iv: CryptoJS.enc.Hex.parse(iv) }).toString();
  return { encrypted, iv };
}

function decryptSequence(encrypted, iv) {
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY, { iv: CryptoJS.enc.Hex.parse(iv) });
    const text = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

module.exports = { encryptSequence, decryptSequence };
