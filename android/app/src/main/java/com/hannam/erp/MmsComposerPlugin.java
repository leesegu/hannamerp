package com.hannam.erp;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;                 // ✅ 올바른 import
import com.getcapacitor.annotation.CapacitorPlugin;  // ✅ 그대로 사용

import java.io.File;

@CapacitorPlugin(name = "MmsComposer")
public class MmsComposerPlugin extends Plugin {

  @PluginMethod
  public void compose(PluginCall call) {
    String phone = call.getString("phone");
    String fileUriStr = call.getString("fileUri");
    String mime = call.getString("mimeType", "image/jpeg");

    if (phone == null || phone.trim().isEmpty()) {
      call.reject("phone required");
      return;
    }
    if (fileUriStr == null || fileUriStr.trim().isEmpty()) {
      call.reject("fileUri required");
      return;
    }

    try {
      Uri src = Uri.parse(fileUriStr);
      Uri contentUri;

      if ("content".equalsIgnoreCase(src.getScheme())) {
        contentUri = src;
      } else if ("file".equalsIgnoreCase(src.getScheme())) {
        File f = new File(src.getPath());
        contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                f
        );
      } else {
        File f = new File(fileUriStr);
        contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                f
        );
      }

      PackageManager pm = getContext().getPackageManager();
      String googleMsgPkg = "com.google.android.apps.messaging";
      boolean useGoogle = false;
      try {
        pm.getPackageInfo(googleMsgPkg, 0);
        useGoogle = true;
      } catch (Exception ignore) {}

      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType(mime);
      send.putExtra(Intent.EXTRA_STREAM, contentUri);
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

      // (비표준) 일부 메시지 앱에서만 인식되는 힌트
      send.putExtra("address", phone);
      send.putExtra("exit_on_sent", true);

      if (useGoogle) send.setPackage(googleMsgPkg);

      try {
        getActivity().startActivity(Intent.createChooser(send, "전송"));
        call.resolve();
      } catch (Exception e) {
        // 최후: 번호만 채워서 SMS 화면
        Intent sendTo = new Intent(Intent.ACTION_SENDTO);
        sendTo.setData(Uri.parse("smsto:" + phone));
        getActivity().startActivity(sendTo);
        call.resolve();
      }
    } catch (Exception e) {
      call.reject("compose failed: " + e.getMessage());
    }
  }
}
