/** Encrypts API keys before they are written to the database. */
export interface SecretBox {
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}
const PREFIX = 'enc1:';
/** Adapts Electron's safeStorage (Windows DPAPI) or any compatible object. */
export function secretBox(storage: {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}): SecretBox {
  return {
    available: () => storage.isEncryptionAvailable(),
    encrypt: (plain) => PREFIX + storage.encryptString(plain).toString('base64'),
    decrypt(stored) {
      if (!stored.startsWith(PREFIX)) throw new Error('validation');
      return storage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'));
    },
  };
}
