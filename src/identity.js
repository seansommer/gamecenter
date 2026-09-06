export const normalizeEmail = (value = "") => String(value).trim().toLowerCase();
export const normalizeNickname = (value = "") => String(value).toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
export async function digest(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
export const loginKey = (email, nickname) => digest(`${normalizeEmail(email)}|${normalizeNickname(nickname)}`);
export function createMessageId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => alphabet[byte & 31]).join("");
}
export const messageKey = (id, nickname) => digest(`message-v1|${id}|${normalizeNickname(nickname)}`);
export function validatePlayer(email, nickname) {
  if (!normalizeEmail(email).includes("@")) throw new Error("Enter your email address.");
  if (!normalizeNickname(nickname)) throw new Error("Your nickname needs at least one letter or number.");
  if (String(nickname).trim().length > 30) throw new Error("Keep your nickname to 30 characters.");
}
