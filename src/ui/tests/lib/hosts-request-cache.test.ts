import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Re-import the module fresh for each test to reset module-level state.
// We use vi.isolateModules() so each test gets its own cache instances
// and listener registration.
import type { SSHFolder } from "@/types/index";

describe("getCachedSSHFolders", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent folder requests into a single loader call", async () => {
    const { getCachedSSHFolders } = await import("../../lib/hosts-request-cache");

    let calls = 0;
    const loader = vi.fn(async (): Promise<SSHFolder[]> => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return [{ id: 1, name: "Production", color: "#ff0000", icon: null, credentialId: null }] as SSHFolder[];
    });

    const [a, b] = await Promise.all([
      getCachedSSHFolders(loader),
      getCachedSSHFolders(loader),
    ]);

    expect(calls).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].name).toBe("Production");
  });

  it("serves cached folders within TTL without a second request", async () => {
    const { getCachedSSHFolders } = await import("../../lib/hosts-request-cache");

    const folder = { id: 1, name: "Staging", color: null, icon: null, credentialId: null } as SSHFolder;
    const loader = vi.fn(async (): Promise<SSHFolder[]> => [folder]);

    await getCachedSSHFolders(loader);
    await getCachedSSHFolders(loader);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("invalidates folders cache on termix:hosts-changed event", async () => {
    const { getCachedSSHFolders } = await import("../../lib/hosts-request-cache");

    const loader = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, name: "A" } as SSHFolder])
      .mockResolvedValueOnce([{ id: 2, name: "B" } as SSHFolder]);

    // Warm the cache
    await getCachedSSHFolders(loader);
    expect(loader).toHaveBeenCalledTimes(1);

    // Fire the hosts-changed event — this should invalidate the folders cache
    window.dispatchEvent(new CustomEvent("termix:hosts-changed"));

    // Next call should load fresh data
    const result = await getCachedSSHFolders(loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result[0].name).toBe("B");
  });

  it("invalidates folders cache on ssh-hosts:changed event", async () => {
    const { getCachedSSHFolders } = await import("../../lib/hosts-request-cache");

    const loader = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, name: "A" } as SSHFolder])
      .mockResolvedValueOnce([{ id: 2, name: "B" } as SSHFolder]);

    await getCachedSSHFolders(loader);
    window.dispatchEvent(new CustomEvent("ssh-hosts:changed"));

    const result = await getCachedSSHFolders(loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result[0].name).toBe("B");
  });

  it("invalidates folders cache on hosts:refresh event", async () => {
    const { getCachedSSHFolders } = await import("../../lib/hosts-request-cache");

    const loader = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, name: "Old" } as SSHFolder])
      .mockResolvedValueOnce([{ id: 2, name: "New" } as SSHFolder]);

    await getCachedSSHFolders(loader);
    window.dispatchEvent(new CustomEvent("hosts:refresh"));

    const result = await getCachedSSHFolders(loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result[0].name).toBe("New");
  });
});
