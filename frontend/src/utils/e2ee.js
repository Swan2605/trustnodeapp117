import axios from 'axios';

const KEY_PREFIX = 'trustnode:e2ee';
const LEGACY_PUBLIC_KEY = 'publicKey';
const LEGACY_PRIVATE_KEY = 'privateKey';

const getStorageKeys = (userId) => ({
  publicKey: `${KEY_PREFIX}:${userId}:public`,
  privateKey: `${KEY_PREFIX}:${userId}:private`
});

const ensureCryptoSupport = () => {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is unavailable in this browser.');
  }
};

const arrayBufferToBase64 = (value) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
};

const base64ToArrayBuffer = (value) => {
  const normalized = String(value || '').replace(/\s+/g, '');
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

const stripPem = (keyMaterial = '') => {
  const trimmed = String(keyMaterial || '').trim();
  if (!trimmed) return '';
  if (!trimmed.includes('BEGIN')) {
    return trimmed.replace(/\s+/g, '');
  }

  return trimmed
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
};

export const getUserIdFromToken = (token) => {
  try {
    const payload = JSON.parse(window.atob(String(token || '').split('.')[1] || ''));
    return payload?.id ? String(payload.id) : '';
  } catch (error) {
    return '';
  }
};

const persistKeyPair = (userId, keyPair) => {
  const storageKeys = getStorageKeys(userId);
  localStorage.setItem(storageKeys.publicKey, keyPair.publicKeyBase64);
  localStorage.setItem(storageKeys.privateKey, keyPair.privateKeyBase64);
};

const readStoredKeyPair = (userId) => {
  const storageKeys = getStorageKeys(userId);
  const publicKeyBase64 = localStorage.getItem(storageKeys.publicKey);
  const privateKeyBase64 = localStorage.getItem(storageKeys.privateKey);

  if (publicKeyBase64 && privateKeyBase64) {
    return { publicKeyBase64, privateKeyBase64 };
  }

  // Migrate any legacy single-key storage to user-scoped storage.
  const legacyPublic = localStorage.getItem(LEGACY_PUBLIC_KEY);
  const legacyPrivate = localStorage.getItem(LEGACY_PRIVATE_KEY);
  if (legacyPublic && legacyPrivate) {
    const migrated = {
      publicKeyBase64: stripPem(legacyPublic),
      privateKeyBase64: stripPem(legacyPrivate)
    };
    persistKeyPair(userId, migrated);
    return migrated;
  }

  return null;
};

const generateKeyPair = async () => {
  ensureCryptoSupport();
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKeyBase64: arrayBufferToBase64(publicKey),
    privateKeyBase64: arrayBufferToBase64(privateKey)
  };
};

const uploadPublicKey = async ({ token, apiBase, publicKeyBase64 }) => {
  await axios.post(
    `${apiBase}/api/profile/publickey`,
    { publicKey: publicKeyBase64 },
    { headers: { Authorization: `Bearer ${token}` } }
  );
};

export const ensureE2EEIdentity = async ({ token, apiBase }) => {
  ensureCryptoSupport();

  const userId = getUserIdFromToken(token);
  if (!userId) {
    throw new Error('Unable to identify the active user for encrypted chat.');
  }

  let keyPair = readStoredKeyPair(userId);
  if (!keyPair) {
    keyPair = await generateKeyPair();
    persistKeyPair(userId, keyPair);
  }

  await uploadPublicKey({
    token,
    apiBase,
    publicKeyBase64: keyPair.publicKeyBase64
  });

  return {
    userId,
    publicKeyBase64: keyPair.publicKeyBase64,
    privateKeyBase64: keyPair.privateKeyBase64
  };
};

export const getRecipientPublicKey = async ({ token, apiBase, recipientId }) => {
  try {
    const response = await axios.get(
      `${apiBase}/api/profile/publickey/${recipientId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const publicKey = stripPem(response.data?.publicKey || '');
    if (!publicKey) {
      throw new Error('Recipient public key is missing.');
    }
    return publicKey;
  } catch (error) {
    const status = error?.response?.status;
    const backendMessage = error?.response?.data?.msg || '';

    if (status === 404 && backendMessage.toLowerCase().includes('public key')) {
      throw new Error(
        'This user has not enabled secure chat yet. Ask them to sign in once with the latest app and open Messages.'
      );
    }

    throw error;
  }
};

const importPublicKey = async (publicKeyBase64OrPem) => {
  const normalized = stripPem(publicKeyBase64OrPem);
  return window.crypto.subtle.importKey(
    'spki',
    base64ToArrayBuffer(normalized),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
};

const importPrivateKey = async (privateKeyBase64OrPem) => {
  const normalized = stripPem(privateKeyBase64OrPem);
  return window.crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(normalized),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
};

export const encryptMessageForUsers = async ({
  message,
  recipientPublicKey,
  senderPublicKey
}) => {
  ensureCryptoSupport();

  const messageText = String(message || '');
  if (!messageText.trim()) {
    throw new Error('Cannot encrypt an empty message.');
  }

  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedMsg = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(messageText)
  );

  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const recipientKey = await importPublicKey(recipientPublicKey);
  const senderKey = await importPublicKey(senderPublicKey);

  const encryptedAesKeyForRecipient = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientKey,
    rawAesKey
  );

  const encryptedAesKeyForSender = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    senderKey,
    rawAesKey
  );

  return {
    encryptedMsg: arrayBufferToBase64(encryptedMsg),
    encryptedAesKeyForRecipient: arrayBufferToBase64(encryptedAesKeyForRecipient),
    encryptedAesKeyForSender: arrayBufferToBase64(encryptedAesKeyForSender),
    iv: arrayBufferToBase64(iv),
    e2eeVersion: 1
  };
};

export const decryptMessagePayload = async ({
  encryptedMsg,
  encryptedAesKey,
  iv,
  privateKey
}) => {
  ensureCryptoSupport();

  if (!encryptedMsg || !encryptedAesKey || !iv) {
    return '';
  }

  const importedPrivateKey = await importPrivateKey(privateKey);
  const decryptedAesKey = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    importedPrivateKey,
    base64ToArrayBuffer(encryptedAesKey)
  );

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    decryptedAesKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decryptedMessage = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(iv)) },
    aesKey,
    base64ToArrayBuffer(encryptedMsg)
  );

  return new TextDecoder().decode(decryptedMessage);
};

export const isEncryptedMessagePayload = (payload = {}) => Boolean(
  payload.encryptedMsg
  && payload.encryptedAesKey
  && payload.iv
);
