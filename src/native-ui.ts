// src/native-ui.ts
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style as SBStyle } from "@capacitor/status-bar";
import { NavigationBar } from "@capacitor/navigation-bar";

export async function setupNativeUI() {
  if (Capacitor.getPlatform() !== "android") return;

  try {
    // 웹뷰가 상태바 아래에서 시작되도록 (겹침 방지)
    await StatusBar.setOverlaysWebView({ overlay: false });

    // 상태바 배경/아이콘
    await StatusBar.setBackgroundColor({ color: "#f7f8fb" }); // 페이지 배경색과 맞춤
    await StatusBar.setStyle({ style: SBStyle.Dark });        // 어두운 텍스트(밝은 배경일 때)

    // 내비게이션바(하단) 색상/스타일
    await NavigationBar.setColor({ color: "#f7f8fb" });
    await NavigationBar.setStyle({ style: "dark" }); // 아이콘 진하게
    await NavigationBar.setVisibility({ visibility: "visible" });
  } catch (e) {
    console.warn("setupNativeUI error:", e);
  }
}
