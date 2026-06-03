const defaultSummaryIntervalMs = 5000;

const isTraceEnabled = (): boolean => {
  if (process.env.GAME_NETWORK_TRACE === "0") {
    return false;
  }
  if (process.env.GAME_NETWORK_TRACE === "1") {
    return true;
  }
  return process.env.npm_lifecycle_event === "dev";
};

const traceEnablementLabel = (): string | undefined => {
  if (!isTraceEnabled()) {
    return undefined;
  }
  if (process.env.GAME_NETWORK_TRACE === "1") {
    return "GAME_NETWORK_TRACE=1";
  }
  return "npm run dev";
};

const countMap = (): Map<string, number> => new Map();

const byteUnits = ["B", "KB", "MB", "GB"] as const;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < byteUnits.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${byteUnits[unitIndex]}`;
};

export class NetworkDiagnostics {
  private readonly summaryIntervalMs: number;
  private inboundByType = countMap();
  private outboundByType = countMap();
  private inboundCount = 0;
  private outboundCount = 0;
  private inboundBytes = 0;
  private outboundBytes = 0;
  private summaryTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly enabled: boolean = isTraceEnabled(),
    summaryIntervalMs: number = defaultSummaryIntervalMs,
  ) {
    this.summaryIntervalMs = summaryIntervalMs;
    if (this.enabled) {
      this.summaryTimer = setInterval(() => {
        this.flushSummary();
      }, this.summaryIntervalMs);
    }
  }

  public static enabledFromEnv(): boolean {
    return isTraceEnabled();
  }

  public static enablementLabel(): string | undefined {
    return traceEnablementLabel();
  }

  public recordInbound(type: string, byteLength: number): void {
    if (!this.enabled) {
      return;
    }
    this.inboundCount += 1;
    this.inboundBytes += byteLength;
    this.inboundByType.set(type, (this.inboundByType.get(type) ?? 0) + 1);
  }

  public recordOutbound(type: string, byteLength: number): void {
    if (!this.enabled) {
      return;
    }
    this.outboundCount += 1;
    this.outboundBytes += byteLength;
    this.outboundByType.set(type, (this.outboundByType.get(type) ?? 0) + 1);
  }

  public logLifecycle(message: string): void {
    if (!this.enabled) {
      return;
    }
    console.log(`[network] ${message}`);
  }

  public flushSummary(): void {
    if (!this.enabled) {
      return;
    }
    if (this.inboundCount === 0 && this.outboundCount === 0) {
      return;
    }
    const windowSec = this.summaryIntervalMs / 1000;
    this.logDirectionSummary(
      "in",
      this.inboundByType,
      this.inboundCount,
      this.inboundBytes,
      windowSec,
    );
    this.logDirectionSummary(
      "out",
      this.outboundByType,
      this.outboundCount,
      this.outboundBytes,
      windowSec,
    );
    this.resetCounts();
  }

  public dispose(): void {
    if (this.summaryTimer !== undefined) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = undefined;
    }
  }

  private logDirectionSummary(
    direction: "in" | "out",
    counts: Map<string, number>,
    total: number,
    bytes: number,
    windowSec: number,
  ): void {
    const rate = (total / windowSec).toFixed(1);
    const topTypes = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([type, count]) => `${type}=${count}`)
      .join(", ");
    console.log(
      `[network] ${direction} ${total} msgs (~${rate}/s, ${formatBytes(bytes)}): ${topTypes}`,
    );
  }

  private resetCounts(): void {
    this.inboundByType = countMap();
    this.outboundByType = countMap();
    this.inboundCount = 0;
    this.outboundCount = 0;
    this.inboundBytes = 0;
    this.outboundBytes = 0;
  }
}
