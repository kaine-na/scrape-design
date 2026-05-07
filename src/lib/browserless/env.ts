type Env = Record<string, string | undefined>;

type CloudflareEnv = Record<string, unknown>;

type OptionalRequestContextModule = {
  getOptionalRequestContext?: () => { env?: CloudflareEnv } | undefined;
};

function getProcessEnv(): Env {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

async function getCloudflareEnv(): Promise<Env> {
  try {
    const mod = (await import("@cloudflare/next-on-pages")) as OptionalRequestContextModule;
    const env = mod.getOptionalRequestContext?.()?.env;
    if (!env) return {};

    return Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

export async function getBrowserlessEnv(): Promise<Env> {
  return {
    ...getProcessEnv(),
    ...(await getCloudflareEnv())
  };
}
