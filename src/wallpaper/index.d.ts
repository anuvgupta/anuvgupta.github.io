export interface WallpaperControls {
  /** Hours 0..24, or null to follow the real clock. */
  setTime(hours: number | null): void;
  getTime(): number;
}
export function startWallpaper(
  container: HTMLElement,
  options?: { onProgress?: (fraction: number) => void; isHidden?: () => boolean }
): Promise<WallpaperControls>;
