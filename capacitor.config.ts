// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hannam.erp',
  appName: 'HannamERP',
  webDir: 'build',
  server: {
    // 개발 중 실기기에서 로컬 개발서버에 붙이고 싶을 때만 켜세요
    // url: 'http://192.168.0.5:3000',
    // hostname: '192.168.0.5',
    cleartext: true,         // http 통신 허용
    androidScheme: 'http',   // 안드로이드에서 http 스킴으로 동작
  },
};

export default config;
