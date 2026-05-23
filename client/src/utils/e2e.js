/**
 * WakkaChat E2E暗号化ユーティリティ
 * Web Crypto API (AES-GCM + ECDH) を使用
 * サーバーは暗号化されたメッセージを復号できない
 */

// ECDHキーペアを生成（初回のみ）
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );
  // 公開鍵をJWK形式でエクスポート（サーバーに登録）
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  // 秘密鍵はlocalStorageに保存（端末ローカル）
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  localStorage.setItem('wc_e2e_key', JSON.stringify(privateKeyJwk));
  return { publicKeyJwk, privateKeyJwk };
}

// 秘密鍵をlocalStorageから復元
async function getPrivateKey() {
  const stored = localStorage.getItem('wc_e2e_key');
  if (!stored) throw new Error('E2E秘密鍵が見つかりません');
  const jwk = JSON.parse(stored);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
}

// 相手の公開鍵（JWK）からCryptoKeyを復元
async function importPublicKey(publicKeyJwk) {
  return crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

// ECDH鍵共有でAES-GCMキーを導出
async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// メッセージを暗号化
export async function encryptMessage(plaintext, recipientPublicKeyJwk) {
  const myPrivateKey = await getPrivateKey();
  const theirPublicKey = await importPublicKey(recipientPublicKeyJwk);
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);
  // iv + ciphertext をbase64で返す
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

// メッセージを復号
export async function decryptMessage(encryptedBase64, senderPublicKeyJwk) {
  try {
    const myPrivateKey = await getPrivateKey();
    const theirPublicKey = await importPublicKey(senderPublicKeyJwk);
    const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch(e) {
    console.warn('E2E復号失敗:', e);
    return '[🔒 暗号化メッセージ（復号失敗）]';
  }
}

// E2E暗号化を初期化（初回登録 or 鍵がなければ生成）
export async function initE2E(axiosInstance) {
  let publicKeyJwk;
  if (!localStorage.getItem('wc_e2e_key')) {
    const { publicKeyJwk: pk } = await generateKeyPair();
    publicKeyJwk = pk;
  } else {
    const stored = localStorage.getItem('wc_e2e_key');
    const privateJwk = JSON.parse(stored);
    // 公開鍵を秘密鍵から再導出
    const privateKey = await crypto.subtle.importKey(
      'jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
    );
    // ECDHの場合は秘密鍵から公開鍵を直接取得できないのでJWKから計算
    publicKeyJwk = { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x, y: privateJwk.y };
  }
  // サーバーに公開鍵を登録
  await axiosInstance.post('/api/e2e/register-key', { publicKey: publicKeyJwk });
  return publicKeyJwk;
}
