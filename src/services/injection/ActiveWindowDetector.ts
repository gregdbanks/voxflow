import type { ActiveWindowInfo, IActiveWindow } from '../../platform/interfaces.js';

/**
 * Wraps `@paymoapp/active-window`. Returns `null` when the package is
 * unavailable or Accessibility permission hasn't been granted — callers are
 * expected to handle that (M6 context-aware prompts fall back to "default").
 */
export class MacActiveWindowDetector implements IActiveWindow {
  private readonly requireAccessibility: boolean;
  private impl: { getActiveWindow: () => ActiveWindowRaw | null } | null = null;
  private warned = false;

  constructor(options: { requireAccessibility?: boolean } = {}) {
    this.requireAccessibility = options.requireAccessibility ?? false;
  }

  async getActive(): Promise<ActiveWindowInfo | null> {
    const impl = await this.load();
    if (!impl) return null;
    try {
      const raw = impl.getActiveWindow();
      if (!raw) return null;
      return normalize(raw);
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        // eslint-disable-next-line no-console
        console.warn('ActiveWindowDetector failed — returning null', err);
      }
      return null;
    }
  }

  private async load(): Promise<{ getActiveWindow: () => ActiveWindowRaw | null } | null> {
    if (this.impl) return this.impl;
    try {
      const mod = (await import('@paymoapp/active-window')) as unknown as {
        default: {
          initialize: (opts?: { accessibilityPermission?: boolean }) => void;
          getActiveWindow: () => ActiveWindowRaw | null;
          subscribe?: unknown;
        };
      };
      mod.default.initialize({ accessibilityPermission: this.requireAccessibility });
      this.impl = { getActiveWindow: () => mod.default.getActiveWindow() };
      return this.impl;
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        // eslint-disable-next-line no-console
        console.warn('ActiveWindowDetector unavailable', err);
      }
      return null;
    }
  }
}

interface ActiveWindowRaw {
  title?: string;
  application?: string;
  path?: string;
  pid?: number;
  id?: number | string;
}

function normalize(raw: ActiveWindowRaw): ActiveWindowInfo {
  return {
    appName: raw.application ?? 'Unknown',
    title: raw.title ?? '',
    bundleId: raw.path,
  };
}
