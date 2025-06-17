/**
 * Generates a SHA-256 hash of the given string after trimming whitespace and converting to lowercase.
 *
 * @param {string} str - The input string to hash.
 * @returns {string} The SHA-256 hash of the processed input string.
 */
import SHA256 from 'crypto-js/sha256';

export function sha256(str) {
  return SHA256(str.trim().toLowerCase()).toString();
}