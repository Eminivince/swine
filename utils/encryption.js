// encryption.js

const crypto = require("crypto");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const algorithm = "aes-256-cbc";
const secretKey = process.env.ENCRYPTION_KEY; // Must be 32 characters
const ivLength = 16; // AES block size

/**
 * Encrypts a given text using AES-256-CBC.
 * @param {String} text - The text to encrypt.
 * @returns {String} - The encrypted text in hex format.
 */
function encrypt(text) {
  if (!secretKey) {
    throw new Error(
      "❌ ENCRYPTION_KEY is not defined in the environment variables."
    );
  }

  if (secretKey.length !== 32) {
    throw new Error("❌ ENCRYPTION_KEY must be exactly 32 characters long.");
  }

  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypts a given encrypted text using AES-256-CBC.
 * @param {String} text - The encrypted text in hex format.
 * @returns {String} - The decrypted plain text.
 */
function decrypt(text) {
  if (!secretKey) {
    throw new Error(
      "❌ ENCRYPTION_KEY is not defined in the environment variables."
    );
  }

  if (secretKey.length !== 32) {
    throw new Error("❌ ENCRYPTION_KEY must be exactly 32 characters long.");
  }

  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift(), "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(secretKey),
    iv
  );
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}


module.exports = {
  encrypt,
  decrypt,
};
