/**
 * Where is this running? The same build serves the mobile website and — next —
 * the installed mobile app (a native shell such as Capacitor wraps these exact
 * files). Anything that must behave differently inside the app checks here.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function isNativeApp(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** True when opened from the home screen as an installed web app. */
export function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
