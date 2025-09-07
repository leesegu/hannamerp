package com.hannam.erp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // ✅ 커스텀 MMS 플러그인 등록
    registerPlugin(MmsComposerPlugin.class);
  }
}
