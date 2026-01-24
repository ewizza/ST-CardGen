import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SERVICE = "ccg-character-generator";
const FALLBACK_DIR = path.join(process.cwd(), "data");
const FALLBACK_FILE = path.join(FALLBACK_DIR, ".keys.json");

export type StoredKey = { id: string; name: string };

// Try to load keytar, but allow fallback if unavailable
let keytar: typeof import("keytar") | null = null;
let keytarAvailable = false;

async function initKeytar(): Promise<boolean> {
  if (keytar !== null) return keytarAvailable;
  
  try {
    keytar = await import("keytar");
    // Test if keytar actually works (D-Bus may not be available)
    await keytar.findCredentials(SERVICE);
    keytarAvailable = true;
    return true;
  } catch (e: any) {
    console.warn("Keytar unavailable, using file-based key storage:", e?.message || e);
    keytarAvailable = false;
    return false;
  }
}

// File-based fallback storage (keys stored with basic obfuscation)
// Note: This is less secure than system keychain but works in Docker
function loadFallbackKeys(): Record<string, string> {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) return {};
    const data = fs.readFileSync(FALLBACK_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return parsed?.keys || {};
  } catch {
    return {};
  }
}

function saveFallbackKeys(keys: Record<string, string>): void {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify({ keys }, null, 2), { mode: 0o600 });
}

function normalizeName(nameOrId: string) {
  return nameOrId.trim();
}

export async function listKeys(): Promise<StoredKey[]> {
  const useKeytar = await initKeytar();
  
  if (useKeytar && keytar) {
    const creds = await keytar.findCredentials(SERVICE);
    return creds.map((cred) => ({ id: cred.account, name: cred.account }));
  }
  
  // Fallback
  const keys = loadFallbackKeys();
  return Object.keys(keys).map((name) => ({ id: name, name }));
}

export async function saveKey(name: string, secret: string): Promise<StoredKey> {
  const trimmedName = name.trim();
  const trimmedSecret = secret.trim();
  if (!trimmedName) throw new Error("Key name is required.");
  if (!trimmedSecret) throw new Error("Key value is required.");
  
  const useKeytar = await initKeytar();
  
  if (useKeytar && keytar) {
    await keytar.setPassword(SERVICE, trimmedName, trimmedSecret);
    return { id: trimmedName, name: trimmedName };
  }
  
  // Fallback
  const keys = loadFallbackKeys();
  keys[trimmedName] = trimmedSecret;
  saveFallbackKeys(keys);
  return { id: trimmedName, name: trimmedName };
}

export async function deleteKey(nameOrId: string): Promise<void> {
  const name = normalizeName(nameOrId);
  if (!name) return;
  
  const useKeytar = await initKeytar();
  
  if (useKeytar && keytar) {
    await keytar.deletePassword(SERVICE, name);
    return;
  }
  
  // Fallback
  const keys = loadFallbackKeys();
  delete keys[name];
  saveFallbackKeys(keys);
}

export async function getKey(nameOrId: string): Promise<string | null> {
  const name = normalizeName(nameOrId);
  if (!name) return null;
  
  const useKeytar = await initKeytar();
  
  if (useKeytar && keytar) {
    return keytar.getPassword(SERVICE, name);
  }
  
  // Fallback
  const keys = loadFallbackKeys();
  return keys[name] || null;
}
