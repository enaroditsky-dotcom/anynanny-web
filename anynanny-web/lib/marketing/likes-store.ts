export type LikeStore = {
  insert(tokenHash: string, createdAt?: string): Promise<"inserted" | "duplicate">;
};

function createSerialLikeStore(store: LikeStore): LikeStore {
  let queue = Promise.resolve();
  return {
    insert(tokenHash, createdAt) {
      const run = queue.then(() => store.insert(tokenHash, createdAt));
      queue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}

export function createMemoryLikeStore(
  seed: Iterable<[string, string]> = []
): LikeStore & { records: Map<string, string> } {
  const records = new Map<string, string>(seed);
  const base: LikeStore & { records: Map<string, string> } = {
    records,
    async insert(tokenHash, createdAt = new Date().toISOString()) {
      if (records.has(tokenHash)) return "duplicate";
      records.set(tokenHash, createdAt);
      return "inserted";
    }
  };
  return Object.assign(createSerialLikeStore(base), { records });
}

export async function createFileLikeStore(filePath: string): Promise<LikeStore> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  async function readAll(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed as Record<string, string>;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeAll(records: Record<string, string>): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    await fs.rename(tmp, filePath);
  }

  return createSerialLikeStore({
    async insert(tokenHash, createdAt = new Date().toISOString()) {
      const records = await readAll();
      if (records[tokenHash]) return "duplicate";
      records[tokenHash] = createdAt;
      await writeAll(records);
      return "inserted";
    }
  });
}

export function createSupabaseLikeStore(client: {
  from: (table: string) => any;
}): LikeStore {
  return {
    async insert(tokenHash) {
      const { data, error } = await client
        .from("marketing_homepage_likes")
        .insert({ token_hash: tokenHash })
        .select("token_hash")
        .maybeSingle();

      if (error) {
        if (error.code === "23505") return "duplicate";
        throw new Error(error.message);
      }

      return data ? "inserted" : "duplicate";
    }
  };
}

let testStore: LikeStore | null = null;

export function setMarketingLikeTestStore(store: LikeStore | null): void {
  testStore = store;
}

export function resolveMarketingLikesStoreMode(
  env: NodeJS.ProcessEnv = process.env
): "test" | "local" | "supabase" | "unconfigured" {
  if (testStore) return "test";
  const explicit = (env.MARKETING_LIKES_STORE || "").trim().toLowerCase();
  if (explicit === "memory" || explicit === "local" || explicit === "file") return "local";
  if (explicit === "supabase") return "supabase";
  if (env.NODE_ENV === "production") {
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
    return "unconfigured";
  }
  return "local";
}

let fileStorePromise: Promise<LikeStore> | null = null;

export async function getMarketingLikeStore(
  env: NodeJS.ProcessEnv = process.env
): Promise<LikeStore> {
  const mode = resolveMarketingLikesStoreMode(env);
  if (mode === "test" && testStore) return testStore;
  if (mode === "local") {
    const filePath =
      env.MARKETING_LIKES_FILE ||
      `${process.cwd()}/.data/marketing-homepage-likes.json`;
    if (!fileStorePromise) {
      fileStorePromise = createFileLikeStore(filePath);
    }
    return fileStorePromise;
  }
  if (mode === "supabase") {
    const { getSupabaseServiceRoleClient } = await import("@/lib/supabase/admin");
    return createSupabaseLikeStore(getSupabaseServiceRoleClient());
  }
  throw new Error("MARKETING_LIKES_UNCONFIGURED");
}
