// The deployed Worker injects DB through cloudflare:workers. Keep the local
// binding type aligned with the Drizzle D1 client accepted by this project.
declare module "cloudflare:workers" {
  export const env: {
    DB?: Parameters<typeof import("drizzle-orm/d1").drizzle>[0];
  };
}

