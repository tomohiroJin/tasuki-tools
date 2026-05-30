/**
 * Wake Lock — スリープ抑止
 * T061: FR-032
 */

export class WakeLockManager {
  private lock: WakeLockSentinel | null = null;
  private enabled = false;

  async acquire(): Promise<void> {
    if (!("wakeLock" in navigator)) return;
    try {
      this.lock = await navigator.wakeLock.request("screen");
      this.enabled = true;

      this.lock.addEventListener("release", () => {
        this.lock = null;
        this.enabled = false;
      });
    } catch {
      // Wake Lock 取得失敗は無視（権限なし等）
    }
  }

  async release(): Promise<void> {
    if (this.lock) {
      await this.lock.release();
      this.lock = null;
      this.enabled = false;
    }
  }

  /** 可視状態復帰時に再取得する */
  setupVisibilityReacquire(): () => void {
    const handler = async () => {
      if (document.visibilityState === "visible" && this.enabled && !this.lock) {
        await this.acquire();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }

  get isActive(): boolean {
    return this.lock !== null;
  }
}
