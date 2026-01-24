import fs from "node:fs";
import path from "node:path";

const SERVICE = "ccg-character-generator";
const FALLBACK_DIR = path.join(process.cwd(), "data");
const FALLBACK_FILE = path.join(FALLBACK_DIR, ".keys.json");

// Environment variable prefix for API keys
// Example: CCG_KEY_OPENAI=sk-xxx will create a key named "openai"
const ENV_KEY_PREFIX = "CCG_KEY_";

export type StoredKey = { id: string; name: string; source?: "env" | "keytar" | "file" };

// Try to load keytar, but allow fallback if unavailable
let keytar: typeof import("keytar") | null = null;
let keytarAvailable: boolean | null = null;

async function initKeytar(): Promise<boolean> {
  if (keytarAvailable !== null) return keytarAvailable;
  
  try {
    keytar = await import("keytar");
    // Test if keytar actually works (D-Bus may not be available)
    await keytar.findCredentials(SERVICE);
    keytarAvailable = true;
    console.log("Using system keychain for key storage");
    return true;
  } catch (e: any) {
    console.warn("Keytar unavailable, using file-based key storage:", e?.message || e);
    keytarAvailable = false;
    return false;
  }
}

// Get keys from environment variables
function getEnvKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(ENV_KEY_PREFIX) && value) {
      // CCG_KEY_OPENAI -> openai
      const name = key.slice(ENV_KEY_PREFIX.length).toLowerCase();
      if (name) {
        keys[name] = value;
      }
    }
  }
  return keys;
}

// File-based fallback storage
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
  const results: StoredKey[] = [];
  const seen = new Set<string>();
  
  // 1. Environment variables (highest priority, read-only)
  const envKeys = getEnvKeys();
  for (const name of Object.keys(envKeys)) {
    results.push({ id: name, name, source: "env" });
    seen.add(name.toLowerCase());
  }
  
  // 2. Try keytar
  const useKeytar = await initKeytar();
  if (useKeytar && keytar) {
    const creds = await keytar.findCredentials(SERVICE);
    for (const cred of creds) {
      if (!seen.has(cred.account.toLowerCase())) {
        results.push({ id: cred.account, name: cred.account, source: "keytar" });
        seen.add(cred.account.toLowerCase());
      }
    }
  }
  
  // 3. File fallback
  const fileKeys = loadFallbackKeys();
  for (const name of Object.keys(fileKeys)) {
    if (!seen.has(name.toLowerCase())) {
      results.push({ id: name, name, source: "file" });
      seen.add(name.toLowerCase());
    }
  }
  
  return results;
}

export async function saveKey(name: string, secret: string): Promise<StoredKey> {
  const trimmedName = name.trim();
  const trimmedSecret = secret.trim();
  if (!trimmedName) throw new Error("Key name is required.");
  if (!trimmedSecret) throw new Error("Key value is required.");
  
  // Check if this key is from environment (can't overwrite)
  const envKeys = getEnvKeys();
  if (envKeys[trimmedName.toLowerCase()]) {
    throw new Error(`Key "${trimmedName}" is set via environment variable and cannot be modified.`);
  }
  
  const useKeytar = await initKeytar();
  
  if (useKeytar && keytar) {
    await keytar.setPassword(SERVICE, trimmedName, trimmedSecret);
    return { id: trimmedName, name: trimmedName, source: "keytar" };
  }
  
  // Fallback to file
  const keys = loadFallbackKeys();
  keys[trimmedName] = trimmedSecret;
  saveFallbackKeys(keys);
  return { id: trimmedName, name: trimmedName, source: "file" };
}

export async function deleteKey(nameOrId: string): Promise<void> {
  const name = normalizeName(nameOrId);
  if (!name) return;
  
  // Check if this key is from environment (can't delete)
  const envKeys = getEnvKeys();
  if (envKeys[name.toLowerCase()]) {
    throw new Error(`Key "${name}" is set via environment variable and cannot be deleted.`);
  }
  
  const useKeytar = await initKeytar();
  
  if (useKeytar && keytar) {
    await keytar.deletePassword(SERVICE, name);
  }
  
  // Also try to delete from file fallback
  const keys = loadFallbackKeys();
  if (keys[name]) {
    delete keys[name];
    saveFallbackKeys(keys);
  }
}

export async function getKey(nameOrId: string): Promise<string | null> {
  const name = normalizeName(nameOrId);
  if (!name) return null;
  
  // 1. Check environment variables first (highest priority)
  const envKeys = getEnvKeys();
  const envKey = envKeys[name.toLowerCase()] || envKeys[name];
  if (envKey) return envKey;
  
  // 2. Try keytar
  const useKeytar = await initKeytar();
  if (useKeytar && keytar) {
    const keytarValue = await keytar.getPassword(SERVICE, name);
    if (keytarValue) return keytarValue;
  }
  
  // 3. File fallback
  const keys = loadFallbackKeys();
  return keys[name] || null;
}
