type StoredIn = "env" | "keytar" | "config" | "none";

export type ReadApiKeyResult = {
  storedIn: StoredIn;
  value?: string;
};

export type ReadApiKeyArgs = {
  envVar: string;
  service: string;
  account: string;
  readFromConfig: () => string | null | undefined;
};

export type SaveApiKeyResult = {
  ok: true;
  storedIn: "keytar" | "config";
  warning?: string;
};

export type SaveApiKeyArgs = {
  envVar: string;
  service: string;
  account: string;
  value: string;
  preferKeytar: boolean;
  writeToConfig: (value: string) => void | Promise<void>;
};

type KeytarModule = {
  findCredentials: (service: string) => Promise<Array<{ account: string; password: string }>>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
  getPassword: (service: string, account: string) => Promise<string | null>;
};

let keytarPromise: Promise<KeytarModule | null> | null = null;

async function loadKeytar(): Promise<KeytarModule | null> {
  if (!keytarPromise) {
    keytarPromise = import("keytar")
      .then((mod: any) => (mod?.default ?? mod) as KeytarModule)
      .catch(() => null);
  }
  return keytarPromise;
}

function normalize(value: string) {
  return value.trim();
}

function readEnv(envVar: string) {
  if (!envVar) return null;
  const raw = process.env[envVar];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isKeytarError(err: unknown) {
  const message = String((err as any)?.message ?? err).toLowerCase();
  return (
    message.includes("org.freedesktop.secrets") ||
    message.includes("could not connect") ||
    message.includes("no such file or directory") ||
    message.includes("the name org.freedesktop.secrets was not provided")
  );
}

function formatKeytarWarning(err?: unknown) {
  const base = "OS keychain unavailable; stored key in config file instead.";
  if (!err) return base;
  if (isKeytarError(err)) return base;
  return base;
}

export async function readApiKey(args: ReadApiKeyArgs): Promise<ReadApiKeyResult> {
  const envValue = readEnv(args.envVar);
  if (envValue) return { storedIn: "env", value: envValue };

  const account = normalize(args.account || "");
  if (account) {
    const keytar = await loadKeytar();
    if (keytar) {
      try {
        const value = await keytar.getPassword(args.service, account);
        if (value) return { storedIn: "keytar", value };
      } catch {
        // fall through to config
      }
    }

    try {
      const value = args.readFromConfig();
      if (typeof value === "string" && value.trim()) {
        return { storedIn: "config", value: value.trim() };
      }
    } catch {
      // ignore config read errors
    }
  }

  return { storedIn: "none" };
}

export async function saveApiKey(args: SaveApiKeyArgs): Promise<SaveApiKeyResult> {
  const account = normalize(args.account || "");
  const value = normalize(args.value || "");
  if (!account) throw new Error("Key name is required.");
  if (!value) throw new Error("Key value is required.");

  if (args.preferKeytar) {
    const keytar = await loadKeytar();
    if (keytar) {
      try {
        await keytar.setPassword(args.service, account, value);
        return { ok: true, storedIn: "keytar" };
      } catch (e: any) {
        await args.writeToConfig(value);
        return { ok: true, storedIn: "config", warning: formatKeytarWarning(e) };
      }
    }
    await args.writeToConfig(value);
    return { ok: true, storedIn: "config", warning: formatKeytarWarning() };
  }

  await args.writeToConfig(value);
  return { ok: true, storedIn: "config" };
}

export async function listKeytarAccounts(service: string): Promise<string[]> {
  const keytar = await loadKeytar();
  if (!keytar) return [];
  try {
    const creds = await keytar.findCredentials(service);
    return creds.map((cred) => cred.account).filter((name) => typeof name === "string" && name.trim());
  } catch {
    return [];
  }
}

export async function deleteKeytarAccount(service: string, account: string): Promise<void> {
  const name = normalize(account || "");
  if (!name) return;
  const keytar = await loadKeytar();
  if (!keytar) return;
  try {
    await keytar.deletePassword(service, name);
  } catch {
    // ignore keytar delete errors
  }
}
