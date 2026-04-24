import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const useE2EE = () => {
  const [publicKey, setPublicKey] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [keyPair, setKeyPair] = useState(null);
  const [keysReady, setKeysReady] = useState(false);

  useEffect(() => {
    generateKeys();
  }, []);

  // const generateKeys = async () => {
  //   try {
  //     const kp = await window.crypto.subtle.generateKey(
  //       {
  //         name: 'RSA-OAEP',
  //         modulusLength: 2048,
  //         publicExponent: new Uint8Array([1, 0, 1]),
  //         hash: 'SHA-256'
  //       },
  //       true,
  //       ['encrypt', 'decrypt']
  //     );
      
  //     const pubKey = await window.crypto.subtle.exportKey('spki', kp.publicKey);
  //     const privKey = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey);
      
  //     setPublicKey(pubKey);
  //     setPrivateKey(privKey);
  //     setKeyPair(kp);
  //     setKeysReady(true); // Mark keys as ready
  //     console.log('🔑 Keys generated and ready');

  //     // Send public key to backend
  //     const pubKeyBase64 = arrayBufferToBase64(pubKey);
  //     try {
  //       await axios.post(
  //         `${API_BASE}/api/profile/publickey`,
  //         { publicKey: pubKeyBase64 },
  //         { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
  //       );
  //       console.log('✅ Public key sent to backend');
  //     } catch (error) {
  //       console.error('Failed to send public key to backend:', error);
  //     }
  //   } catch (error) {
  //     console.error('Failed to generate keys:', error);
  //   }
  // };


  const generateKeys = async () => {
  try {
    // ✅ Check if keys already exist
    const storedPublicKey = localStorage.getItem('publicKey');
    const storedPrivateKey = localStorage.getItem('privateKey');

    if (storedPublicKey && storedPrivateKey) {
      console.log('🔑 Using stored keys');

      setPublicKey(base64ToArrayBuffer(storedPublicKey));
      setPrivateKey(base64ToArrayBuffer(storedPrivateKey));
      setKeysReady(true);
      return;
    }

    console.log('🔑 Generating new key pair...');

    const kp = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    const pubKey = await window.crypto.subtle.exportKey('spki', kp.publicKey);
    const privKey = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey);

    // ✅ Store keys
    localStorage.setItem('publicKey', arrayBufferToBase64(pubKey));
    localStorage.setItem('privateKey', arrayBufferToBase64(privKey));

    setPublicKey(pubKey);
    setPrivateKey(privKey);
    setKeyPair(kp);
    setKeysReady(true);

    // Send public key to backend
    const pubKeyBase64 = arrayBufferToBase64(pubKey);
    await axios.post(
      `${API_BASE}/api/profile/publickey`,
      { publicKey: pubKeyBase64 },
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
    );

    console.log('✅ Keys generated & stored');
  } catch (error) {
    console.error('❌ Failed to generate keys:', error);
  }
};


  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToArrayBuffer = (base64) => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const encryptMessage = async (message, targetPublicKeyBase64) => {
    try {
      const targetPublicKeyBuffer = base64ToArrayBuffer(targetPublicKeyBase64);
      const targetPublicKey = await window.crypto.subtle.importKey(
        'spki',
        targetPublicKeyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      );

      const aesKey = window.crypto.getRandomValues(new Uint8Array(32));
      const iv = window.crypto.getRandomValues(new Uint8Array(16));

      const aesKeyImported = await window.crypto.subtle.importKey(
        'raw',
        aesKey,
        { name: 'AES-CBC' },
        false,
        ['encrypt']
      );

      const encryptedMsg = await window.crypto.subtle.encrypt(
        { name: 'AES-CBC', iv },
        aesKeyImported,
        new TextEncoder().encode(message)
      );

      const encryptedAesKey = await window.crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        targetPublicKey,
        aesKey
      );

      return {
        encryptedMsg: arrayBufferToBase64(encryptedMsg),
        encryptedAesKey: arrayBufferToBase64(encryptedAesKey),
        iv: arrayBufferToBase64(iv)
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error;
    }
  };

  const decryptMessage = async (encryptedData) => {
    try {
      if (!privateKey) {
        throw new Error('❌ Private key not loaded yet. This should not happen.');
      }

      console.log('🔓 Decrypting message...');
      const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedData.encryptedAesKey);
      const encryptedMsgBuffer = base64ToArrayBuffer(encryptedData.encryptedMsg);
      const ivBuffer = base64ToArrayBuffer(encryptedData.iv);

      const privateKeyImported = await window.crypto.subtle.importKey(
        'pkcs8',
        privateKey,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
      );

      const decryptedAesKey = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKeyImported,
        encryptedAesKeyBuffer
      );

      const aesKeyImported = await window.crypto.subtle.importKey(
        'raw',
        decryptedAesKey,
        { name: 'AES-CBC' },
        false,
        ['decrypt']
      );

      const decryptedMsg = await window.crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: ivBuffer },
        aesKeyImported,
        encryptedMsgBuffer
      );

      const message = new TextDecoder().decode(decryptedMsg);
      console.log('✅ Message decrypted:', message);
      return message;
    } catch (error) {
      console.error('❌ Decryption error:', error.message);
      throw error;
    }
  };

  return { publicKey, privateKey, encryptMessage, decryptMessage, keysReady };
};

export default useE2EE;
