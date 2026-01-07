import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, KEY_LENGTH);
}

function getEncryptionPassword(): string {
  const password = process.env.ENCRYPTION_KEY;
  if (!password) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }
  // Check byte length, not character length
  if (Buffer.byteLength(password, "utf8") < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 bytes long");
  }
  return password;
}

export function encrypt(text: string): string {
  const password = getEncryptionPassword();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Format: salt:iv:tag:encrypted
  return `${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const password = getEncryptionPassword();
  const parts = encryptedText.split(":");

  // Support both old format (3 parts) and new format (4 parts)
  if (parts.length === 3) {
    // Old format without unique salt - still works but uses hardcoded salt
    const [ivHex, tagHex, encrypted] = parts;
    if (!ivHex || !tagHex || !encrypted) {
      throw new Error("Invalid encrypted text format");
    }

    // Use legacy hardcoded salt for backwards compatibility
    const legacySalt = Buffer.from("salt", "utf8");
    const key = deriveKey(password, legacySalt);
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } else if (parts.length === 4) {
    // New format with unique salt
    const [saltHex, ivHex, tagHex, encrypted] = parts;
    if (!saltHex || !ivHex || !tagHex || !encrypted) {
      throw new Error("Invalid encrypted text format");
    }

    const salt = Buffer.from(saltHex, "hex");
    const key = deriveKey(password, salt);
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } else {
    throw new Error("Invalid encrypted text format");
  }
}
