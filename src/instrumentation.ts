export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDatabaseReady } = await import("./lib/db-boot");
    await ensureDatabaseReady();
  }
}
