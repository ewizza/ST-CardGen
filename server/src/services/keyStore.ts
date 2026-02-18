import { deleteApiKeyFromConfig, getApiKeyFromConfig, listApiKeysFromConfig, setApiKeyInConfig } from "../config/store.js";
import { deleteKeytarAccount, listKeytarAccounts, readApiKey, saveApiKey, secureStoreStatus } from "../secrets/secretStore.js";

const SERVICE = "ccg-character-generator";

export type StoredKey = { id: string; name: string };

function normalizeName(nameOrId: string) {
  return nameOrId.trim();
}

export async function listKeys(): Promise<StoredKey[]> {
  const [keytarKeys, configKeys] = await Promise.all([
    listKeytarAccounts(SERVICE),
    Promise.resolve(listApiKeysFromConfig()),
  ]);
  const merged = new Set([...keytarKeys, ...configKeys]);
  return Array.from(merged).map((name) => ({ id: name, name }));
}

export async function saveKey(name: string, secret: string, preferKeytar = true): Promise<StoredKey & { storedIn: "keytar" | "config"; warning?: string }> {
  const trimmedName = name.trim();
  const trimmedSecret = secret.trim();
  if (!trimmedName) throw new Error("Key name is required.");
  if (!trimmedSecret) throw new Error("Key value is required.");
  const result = await saveApiKey({
    envVar: "",
    service: SERVICE,
    account: trimmedName,
    value: trimmedSecret,
    preferKeytar,
    writeToConfig: (value) => setApiKeyInConfig(trimmedName, value),
  });
  return { id: trimmedName, name: trimmedName, storedIn: result.storedIn, warning: result.warning };
}

export async function deleteKey(nameOrId: string): Promise<void> {
  const name = normalizeName(nameOrId);
  if (!name) return;
  await deleteKeytarAccount(SERVICE, name);
  deleteApiKeyFromConfig(name);
}

export async function getKeyWithMeta(nameOrId: string): Promise<{ value: string | null; storedIn: "env" | "keytar" | "config" | "none"; warning?: string }> {
  const name = normalizeName(nameOrId);
  if (!name) return { value: null, storedIn: "none" };
  const result = await readApiKey({
    envVar: "",
    service: SERVICE,
    account: name,
    readFromConfig: () => getApiKeyFromConfig(name),
  });
  if (result.storedIn === "config") {
    const secure = await secureStoreStatus();
    if (!secure.available) {
      return { value: result.value ?? null, storedIn: result.storedIn, warning: secure.warning };
    }
  }
  return { value: result.value ?? null, storedIn: result.storedIn };
}

export async function getKey(nameOrId: string): Promise<string | null> {
  const result = await getKeyWithMeta(nameOrId);
  return result.value;
}
