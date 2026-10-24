export const DEFAULT_POLL_INTERVAL_SECONDS = 30;
export const MIN_POLL_INTERVAL_SECONDS = 10;
export const MAX_POLL_INTERVAL_SECONDS = 3600;
export interface DashboardSettings {
  pollIntervalSeconds: number;
}
