// 하이브리드(네이티브) 여부 감지 (Capacitor 5~7, Cordova 대응)
export const isHybrid = () => {
  try {
    const w = typeof window === "undefined" ? {} : window;
    const cap = w.Capacitor;

    // 1) Capacitor 공식 API 우선
    //    v5~v7: isNativePlatform()가 있으면 그 결과 사용
    if (cap && typeof cap.isNativePlatform === "function") {
      return !!cap.isNativePlatform();
    }
    //    v7: getPlatform() → 'ios' | 'android' | 'web'
    if (cap && typeof cap.getPlatform === "function") {
      const p = cap.getPlatform?.();
      if (p === "ios" || p === "android") return true;
    }

    // 2) Cordova 환경
    if (w.cordova) return true;

    // 3) 그 외는 웹
    return false;
  } catch {
    return false;
  }
};

// 옵션: 플랫폼 문자열 얻기
export const getPlatform = () => {
  try {
    const w = typeof window === "undefined" ? {} : window;
    const cap = w.Capacitor;
    if (cap?.getPlatform) return cap.getPlatform();
    if (w.cordova) return "cordova";
  } catch {}
  return "web";
};

// 옵션: 웹 여부
export const isWeb = () => !isHybrid();
