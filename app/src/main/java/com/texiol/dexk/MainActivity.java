package com.texiol.dexk;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;


import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 701;
    private static final String PREFS = "texiol_dexk_controller_v1";
    private static final String KEY_ADDRESS = "address";
    private static final String KEY_PIN = "pin";
    private static final String KEY_SAVED = "saved_devices_v2";

    private final int background = Color.rgb(7, 16, 31);
    private final int surface = Color.rgb(15, 26, 46);
    private final int surfaceRaised = Color.rgb(18, 31, 54);
    private final int line = Color.rgb(38, 53, 82);
    private final int muted = Color.rgb(161, 170, 189);
    private final int brand = Color.rgb(79, 70, 229);
    private final int success = Color.rgb(54, 211, 153);

    private SharedPreferences prefs;
    private EditText addressInput;
    private EditText pinInput;
    private LinearLayout savedContainer;
    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        installCrashLogger();
        super.onCreate(savedInstanceState);
        try {
            prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            Window window = getWindow();
            window.setStatusBarColor(background);
            window.setNavigationBarColor(background);
            showHome();
            handlePairingIntent(getIntent());
        } catch (Throwable error) {
            writeCrashLog(error);
            showStartupFailure(error);
        }
    }

    private void installCrashLogger() {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            writeCrashLog(error);
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    private void writeCrashLog(Throwable error) {
        try {
            StringWriter writer = new StringWriter();
            error.printStackTrace(new PrintWriter(writer));
            try (FileOutputStream output = new FileOutputStream(new File(getFilesDir(), "last_crash.txt"), false)) {
                output.write(writer.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) { }
    }

    private void showStartupFailure(Throwable error) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(background);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(48), dp(24), dp(32));
        content.addView(text("Dexk could not start", 24, Color.WHITE, Typeface.BOLD));
        TextView detail = text(error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()), 12, Color.rgb(255, 180, 180), Typeface.NORMAL);
        content.addView(detail, marginTop(dp(14), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        Button settings = button("Open app settings", false);
        settings.setOnClickListener(v -> openAppSettings());
        content.addView(settings, marginTop(dp(24), ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));
        root.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    private void showHome() {
        exitImmersive();
        destroyWebView();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(background);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setPadding(0, 0, 0, navigationBarHeight() + dp(36));
        root.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(24), dp(20), dp(52));
        scroll.addView(content, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(com.texiol.dexk.R.drawable.ic_dexk);
        logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        top.addView(logo, new LinearLayout.LayoutParams(dp(50), dp(50)));
        LinearLayout titleBox = new LinearLayout(this);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        titleBox.setPadding(dp(12), 0, 0, 0);
        titleBox.addView(text("Dexk", 21, Color.WHITE, Typeface.BOLD));
        titleBox.addView(text("by Texiol", 10, Color.rgb(142, 153, 177), Typeface.NORMAL));
        top.addView(titleBox, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView state = text("● Ready", 10, success, Typeface.BOLD);
        state.setPadding(dp(12), dp(9), dp(12), dp(9));
        state.setBackground(outlined(Color.rgb(13, 43, 40), Color.rgb(25, 70, 62), 1, 99));
        top.addView(state);
        content.addView(top);

        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setPadding(dp(24), dp(25), dp(24), dp(24));
        hero.setBackground(gradientRounded(new int[]{Color.rgb(22, 30, 66), Color.rgb(48, 28, 94), Color.rgb(24, 48, 99)}, 24));
        ImageView heroLogo = new ImageView(this);
        heroLogo.setImageResource(com.texiol.dexk.R.drawable.ic_dexk);
        heroLogo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        hero.addView(heroLogo, new LinearLayout.LayoutParams(dp(72), dp(72)));
        TextView headline = text("Control your\nWindows PC.", 31, Color.WHITE, Typeface.BOLD);
        headline.setLineSpacing(0, .94f);
        hero.addView(headline, marginTop(dp(18), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView sub = text("Secure, low-latency control with a separate guide pointer before the Windows cursor is shared.", 13, Color.rgb(193, 201, 218), Typeface.NORMAL);
        sub.setLineSpacing(dp(3), 1f);
        hero.addView(sub, marginTop(dp(12), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        hero.addView(text("✓ Visible host approval     ✓ Expiring PIN\n✓ Touchpad + touchscreen     ✓ Multi-cursor guidance", 10, Color.rgb(176, 184, 255), Typeface.BOLD), marginTop(dp(18), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(hero, marginTop(dp(28), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        content.addView(text("FAST CONNECT", 10, Color.rgb(151, 146, 255), Typeface.BOLD), marginTop(dp(28), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        Button scan = button("▦   Scan Windows QR code   →", true);
        scan.setTextSize(16);
        scan.setOnClickListener(v -> scanPairingQr());
        content.addView(scan, marginTop(dp(10), ViewGroup.LayoutParams.MATCH_PARENT, dp(64)));

        TextView or = text("────────────   or connect manually   ────────────", 10, Color.rgb(97, 110, 137), Typeface.NORMAL);
        or.setGravity(Gravity.CENTER);
        content.addView(or, marginTop(dp(22), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout card = card();
        card.addView(text("Connect manually", 21, Color.WHITE, Typeface.BOLD));
        card.addView(text("Use the permanent 12-digit Dexk Internet ID, a LAN- prefixed local ID, or a direct address, plus the 8-digit one-time PIN.", 12, muted, Typeface.NORMAL), marginTop(dp(7), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        card.addView(text("LOCAL DEVICE ID OR DIRECT ADDRESS", 9, Color.rgb(145, 151, 255), Typeface.BOLD), marginTop(dp(20), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        addressInput = editField(prefs.getString(KEY_ADDRESS, ""), "123 456 789 012 or 192.168.1.10:45911");
        card.addView(addressInput, marginTop(dp(8), ViewGroup.LayoutParams.MATCH_PARENT, dp(58)));
        card.addView(text("ONE-TIME PIN", 9, Color.rgb(145, 151, 255), Typeface.BOLD), marginTop(dp(16), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        pinInput = editField(prefs.getString(KEY_PIN, ""), "8-digit PIN from your PC");
        pinInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        card.addView(pinInput, marginTop(dp(8), ViewGroup.LayoutParams.MATCH_PARENT, dp(58)));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button paste = button("Paste", false);
        paste.setOnClickListener(v -> pasteConnectionDetails());
        Button connect = button("Connect securely  →", true);
        connect.setOnClickListener(v -> openController(addressInput.getText().toString(), pinInput.getText().toString()));
        actions.addView(paste, new LinearLayout.LayoutParams(0, dp(56), .28f));
        LinearLayout.LayoutParams connectParams = new LinearLayout.LayoutParams(0, dp(56), .72f);
        connectParams.leftMargin = dp(10);
        actions.addView(connect, connectParams);
        card.addView(actions, marginTop(dp(15), ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));
        content.addView(card, marginTop(dp(18), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        content.addView(text("SAVED COMPUTERS", 10, Color.rgb(151, 146, 255), Typeface.BOLD), marginTop(dp(24), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        savedContainer = new LinearLayout(this);
        savedContainer.setOrientation(LinearLayout.VERTICAL);
        content.addView(savedContainer, marginTop(dp(8), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        renderSavedDevices();

        LinearLayout trust = card();
        trust.addView(text("This phone controls a PC", 16, Color.WHITE, Typeface.BOLD));
        trust.addView(text("Phone hosting and phone-screen mirroring are not included. The app has no Accessibility Service, MediaProjection, unattended access, or QR generator.", 11, muted, Typeface.NORMAL), marginTop(dp(8), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(trust, marginTop(dp(16), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(root);
    }

    private void scanPairingQr() {
        try {
            GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build();
            GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(this, options);
            scanner.startScan()
                .addOnSuccessListener(barcode -> {
                    String rawValue = barcode.getRawValue();
                    if (rawValue == null || rawValue.trim().isEmpty()) {
                        toast("The scanned QR did not contain pairing details");
                        return;
                    }
                    confirmPairingUri(rawValue);
                })
                .addOnCanceledListener(() -> toast("QR scan cancelled"))
                .addOnFailureListener(error -> {
                    writeCrashLog(error);
                    toast("QR scanner could not start. Update Google Play services and try again.");
                });
        } catch (Throwable error) {
            writeCrashLog(error);
            toast("QR scanner could not start");
        }
    }

    private void handlePairingIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri uri = intent.getData();
        if ("dexk".equalsIgnoreCase(uri.getScheme()) && "pair".equalsIgnoreCase(uri.getHost())) {
            confirmPairingUri(uri.toString());
        }
    }

    private void confirmPairingUri(String raw) {
        try {
            Uri uri = Uri.parse(raw);
            if (!"dexk".equalsIgnoreCase(uri.getScheme()) || !"pair".equalsIgnoreCase(uri.getHost())) throw new IllegalArgumentException("This is not a Dexk pairing QR");
            String localId = digits(uri.getQueryParameter("id"));
            String address = uri.getQueryParameter("a");
            String pin = uri.getQueryParameter("p");
            String expiryRaw = uri.getQueryParameter("e");
            if (pin != null && !pin.isEmpty() && !pin.matches("\\d{8}")) throw new IllegalArgumentException("Pairing PIN is invalid");
            if (expiryRaw != null && !expiryRaw.isEmpty() && System.currentTimeMillis() / 1000L > Long.parseLong(expiryRaw)) throw new IllegalArgumentException("This pairing QR has expired");
            String mode = uri.getQueryParameter("mode");
            final String target = (localId.length()==12 && (validLanId(localId) || "lan".equalsIgnoreCase(mode))) ? "LAN-" + localId : (address == null ? "" : address.trim());
            if (target.isEmpty()) throw new IllegalArgumentException("Pairing target is missing");
            final String finalPin = pin == null ? "" : pin;
            String resolved = validLanId(localId) ? decodeLanId(localId) : target;
            new AlertDialog.Builder(this)
                .setTitle("Connect to this Windows PC?")
                .setMessage((validLanId(localId) ? formatLanId("LAN-" + localId) + "\n" + resolved : target) + (finalPin.isEmpty() ? "" : "\nPIN: " + finalPin))
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Open controller", (dialog, which) -> openController(target, finalPin))
                .show();
        } catch (Throwable error) { toast(error.getMessage() == null ? "Invalid pairing QR" : error.getMessage()); }
    }

    private void pasteConnectionDetails() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null || !clipboard.hasPrimaryClip() || clipboard.getPrimaryClip() == null || clipboard.getPrimaryClip().getItemCount() == 0) {
            toast("Clipboard is empty");
            return;
        }
        CharSequence value = clipboard.getPrimaryClip().getItemAt(0).coerceToText(this);
        if (value == null) return;
        String raw = value.toString().trim();
        if (raw.startsWith("dexk://pair")) {
            confirmPairingUri(raw);
            return;
        }
        Matcher idMatcher = Pattern.compile("(?i)(?:(DEXK|LAN)[-\\s]*)?((?:\\d[-\\s]*){12})").matcher(raw);
        Matcher addressMatcher = Pattern.compile("(?i)(?:https?://)?(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d+)?").matcher(raw);
        if (idMatcher.find()) {
            String prefix=idMatcher.group(1); String found=digits(idMatcher.group(2)); addressInput.setText((prefix==null?"DEXK":prefix.toUpperCase())+"-"+found);
        } else if (addressMatcher.find()) {
            addressInput.setText(addressMatcher.group());
        } else {
            addressInput.setText(raw);
        }
        Matcher pinMatcher = Pattern.compile("(?<!\\d)(\\d{8})(?!\\d)").matcher(raw);
        if (pinMatcher.find()) pinInput.setText(pinMatcher.group(1));
    }

    private void openController(String rawTarget, String pairingPin) {
        String target = rawTarget == null ? "" : rawTarget.trim();
        if (target.isEmpty()) { toast("Enter a Dexk Device ID, LAN ID, or direct address"); return; }
        String pin = pairingPin == null ? "" : pairingPin.trim();
        if (!pin.isEmpty() && !pin.matches("\\d{8}")) { toast("PIN must contain 8 digits"); return; }

        String upper = target.toUpperCase();
        String id = digits(target);
        boolean explicitLan = upper.startsWith("LAN-");
        boolean explicitInternet = upper.startsWith("DEXK-") || upper.startsWith("INTERNET-");
        boolean internet = explicitInternet || (!explicitLan && id.length() == 12);
        String address;

        if (internet) {
            if (!CloudAuth.validDeviceId(id)) { toast("Dexk Internet Device ID checksum is invalid"); return; }
            target = "DEXK-" + id;
            address = "file:///android_asset/remote.html?internetTarget=" + Uri.encode(id);
        } else if (explicitLan || validLanId(id)) {
            String ip = decodeLanId(id);
            if (ip == null) { toast("LAN Device ID is invalid"); return; }
            address = "http://" + ip + ":45911/remote";
            target = "LAN-" + id;
        } else {
            address = normalizeDirectAddress(target);
            if (address.isEmpty()) { toast("Invalid direct address"); return; }
        }

        prefs.edit().putString(KEY_ADDRESS, target).putString(KEY_PIN, pin).apply();
        saveDevice(target, "Windows PC");
        showController(address, pin);
    }

    private String normalizeDirectAddress(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return "";
        if (!value.startsWith("http://") && !value.startsWith("https://")) value = "http://" + value;
        if (!value.matches("https?://[^/]+(:\\d+)?(/.*)?")) return "";
        if (!value.matches("https?://[^/]+:\\d+(/.*)?")) {
            int slash = value.indexOf('/', value.indexOf("//") + 2);
            value = slash < 0 ? value + ":45911" : value.substring(0, slash) + ":45911" + value.substring(slash);
        }
        if (!value.contains("/remote")) { if (value.endsWith("/")) value += "remote"; else value += "/remote"; }
        return value;
    }

    private String digits(String raw) { return raw == null ? "" : raw.replaceAll("\\D", ""); }

    private boolean validLanId(String raw) { return decodeLanId(raw) != null; }

    private String formatLanId(String id) {
        String d = digits(id);
        return d.length() == 12 ? "LAN-"+d.substring(0,3)+" "+d.substring(3,6)+" "+d.substring(6,9)+" "+d.substring(9,12) : id;
    }

    private String formatInternetId(String id) {
        String d = digits(id);
        return d.length() == 12 ? "DEXK-"+d.substring(0,3)+" "+d.substring(3,6)+" "+d.substring(6,9)+" "+d.substring(9,12) : id;
    }

    private boolean isInternetTarget(String target) {
        String upper = target == null ? "" : target.trim().toUpperCase();
        String d = digits(target);
        return (upper.startsWith("DEXK-") || upper.startsWith("INTERNET-") || (!upper.startsWith("LAN-") && d.length()==12)) && CloudAuth.validDeviceId(d);
    }

    private String decodeLanId(String raw) {
        try {
            String value = digits(raw);
            if (value.length() != 12 || value.charAt(0) != '3' || !luhnValid(value)) return null;
            long encoded = Long.parseLong(value.substring(1, 11));
            if (encoded < 0 || encoded > 0xFFFFFFFFL) return null;
            long plain = unpermute32(encoded);
            int a = (int)((plain >>> 24) & 255), b = (int)((plain >>> 16) & 255), c = (int)((plain >>> 8) & 255), d = (int)(plain & 255);
            if (!isLocalIpv4(a,b,c,d)) return null;
            return a+"."+b+"."+c+"."+d;
        } catch (Throwable ignored) { return null; }
    }

    private long unpermute32(long value) {
        final int[] keys = {0xA3B1,0xC6EF,0x91D7,0x5B2D,0xE37A,0x4F19};
        int left=(int)((value>>>16)&0xFFFF), right=(int)(value&0xFFFF);
        for(int i=keys.length-1;i>=0;i--){ int oldRight=left; int oldLeft=(right ^ lanRound(oldRight,keys[i])) & 0xFFFF; left=oldLeft; right=oldRight; }
        return ((long)left<<16) | (right&0xFFFFL);
    }

    private int lanRound(int value,int key){
        long x=((value&0xFFFFL)+(key&0xFFFFL))&0xFFFFFFFFL;
        x ^= (x<<7)&0xFFFFFFFFL; x ^= x>>>9; x=(x*0x9E37L)&0xFFFFFFFFL; x ^= x>>>16;
        return (int)x&0xFFFF;
    }

    private boolean luhnValid(String value){
        int sum=0, parity=value.length()%2;
        for(int i=0;i<value.length();i++){char ch=value.charAt(i);if(ch<'0'||ch>'9')return false;int d=ch-'0';if(i%2==parity){d*=2;if(d>9)d-=9;}sum+=d;}
        return sum%10==0;
    }

    private boolean isLocalIpv4(int a,int b,int c,int d){
        if(a==10 || (a==172&&b>=16&&b<=31) || (a==192&&b==168) || (a==169&&b==254)) return true;
        return a==100&&b>=64&&b<=127;
    }

    private void saveDevice(String target, String name) {
        try {
            JSONArray current = new JSONArray(prefs.getString(KEY_SAVED, "[]")); JSONArray next = new JSONArray();
            JSONObject item = new JSONObject(); item.put("target", target); item.put("name", name); item.put("lastUsed", System.currentTimeMillis()); next.put(item);
            for (int i=0;i<current.length() && next.length()<12;i++) { JSONObject old=current.optJSONObject(i); if(old!=null && !target.equals(old.optString("target"))) next.put(old); }
            prefs.edit().putString(KEY_SAVED, next.toString()).apply();
            if (savedContainer != null) renderSavedDevices();
        } catch (Throwable ignored) { }
    }

    private void renderSavedDevices() {
        if (savedContainer == null) return; savedContainer.removeAllViews();
        try {
            JSONArray items = new JSONArray(prefs.getString(KEY_SAVED, "[]"));
            if (items.length() == 0) { TextView empty=text("Saved Windows computers appear here after you connect.",12,muted,Typeface.NORMAL); savedContainer.addView(empty); return; }
            for (int i=0;i<items.length();i++) {
                JSONObject item=items.optJSONObject(i); if(item==null) continue; String target=item.optString("target");
                LinearLayout row=card(); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL);
                TextView dot=text("●",16,Color.rgb(100,116,139),Typeface.BOLD); row.addView(dot,new LinearLayout.LayoutParams(dp(28),dp(40)));
                boolean internet=isInternetTarget(target); boolean local=!internet && (target.toUpperCase().startsWith("LAN-") || validLanId(target)); String ip=local?decodeLanId(target):null;
                LinearLayout copy=new LinearLayout(this); copy.setOrientation(LinearLayout.VERTICAL); copy.addView(text(internet?formatInternetId(target):(local?formatLanId(target):target),15,Color.WHITE,Typeface.BOLD)); TextView status=text(internet?"checking internet presence…":(local?"checking "+ip+"…":"direct LAN address"),10,muted,Typeface.NORMAL); copy.addView(status); row.addView(copy,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));
                Button open=button("Open",false); open.setOnClickListener(v->openController(target,"")); row.addView(open,new LinearLayout.LayoutParams(dp(84),dp(46))); savedContainer.addView(row,marginTop(dp(8),ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT));
                if(internet) checkInternetPresence(target,dot,status); else if(local) checkPresence(target,dot,status);
            }
        } catch (Throwable error) { savedContainer.addView(text("Saved devices could not be loaded.",12,muted,Typeface.NORMAL)); }
    }

    private void checkInternetPresence(String id, TextView dot, TextView status) {
        new Thread(() -> {
            boolean online = false; String label = "offline";
            try {
                List<String> ids = new ArrayList<>(); ids.add(digits(id));
                JSONObject response = CloudAuth.presence(this, ids);
                JSONObject devices = response.optJSONObject("devices");
                JSONObject device = devices == null ? null : devices.optJSONObject(digits(id));
                online = device != null && device.optBoolean("online", false);
                String remoteName = device == null ? "" : device.optString("deviceName", "");
                label = online ? "online · Internet P2P" + (remoteName.isEmpty()?"":" · "+remoteName) : "offline · last seen unavailable";
            } catch (Throwable error) { label = "presence check unavailable"; }
            final boolean result=online; final String text=label; runOnUiThread(()->{dot.setTextColor(result?success:Color.rgb(248,180,70));status.setText(text);status.setTextColor(result?success:Color.rgb(248,180,70));});
        }).start();
    }

    private void checkPresence(String id, TextView dot, TextView status) {
        new Thread(() -> {
            boolean online=false; String ip=decodeLanId(id); String label="offline / unreachable";
            try {
                URL url=new URL("http://"+ip+":45911/api/remote/hello"); HttpURLConnection c=(HttpURLConnection)url.openConnection(); c.setConnectTimeout(1800); c.setReadTimeout(1800); c.setRequestMethod("GET");
                if(c.getResponseCode()==200){BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream()));StringBuilder b=new StringBuilder();String line;while((line=br.readLine())!=null)b.append(line);JSONObject j=new JSONObject(b.toString());online=j.optBoolean("active",false);label=online?"online · "+ip:"reachable · receiving paused";} c.disconnect();
            } catch(Throwable ignored){}
            final boolean result=online; final String text=label; runOnUiThread(()->{dot.setTextColor(result?success:Color.rgb(248,180,70));status.setText(text);status.setTextColor(result?success:Color.rgb(248,180,70));});
        }).start();
    }

    private void showController(String address, String pairingPin) {
        enterImmersive();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(background);
        webView = new WebView(this);
        webView.setBackgroundColor(background);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " TexiolDexkMobile/2.1.0");
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        webView.addJavascriptInterface(new NativeBridge(), "DexkNative");

        progressBar = new ProgressBar(this);
        progressBar.setIndeterminate(true);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(progressBar, new FrameLayout.LayoutParams(dp(42), dp(42), Gravity.CENTER));

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (progressBar != null) progressBar.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    if (progressBar != null) progressBar.setVisibility(View.GONE);
                    toast("Cannot reach the receiver. Check Wi-Fi, address, receiving status, and firewall.");
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                if (progressBar != null) progressBar.setVisibility(newProgress >= 95 ? View.GONE : View.VISIBLE);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    toast("No file picker is available");
                    return false;
                }
                return true;
            }
        });
        setContentView(root);
        String separator = address.contains("?") ? "&" : "?";
        String controllerUrl = address + separator + "client=mobile&name=Android%20controller";
        if (!pairingPin.isEmpty()) controllerUrl += "&pairPin=" + Uri.encode(pairingPin) + "&autoPair=1";
        webView.loadUrl(controllerUrl);
    }

    private final class NativeBridge {
        @JavascriptInterface public void haptic(int milliseconds) { runOnUiThread(() -> MainActivity.this.haptic(milliseconds)); }
        @JavascriptInterface public void sessionState(String state) { runOnUiThread(() -> { if ("active".equals(state)) enterImmersive(); else exitImmersive(); }); }
        @JavascriptInterface public String loadControllerPreferences() { return prefs == null ? "" : prefs.getString("controller_preferences_json", ""); }
        @JavascriptInterface public void saveControllerPreferences(String json) { if (prefs != null && json != null && json.length() <= 16384) prefs.edit().putString("controller_preferences_json", json).apply(); }
        @JavascriptInterface public void cloudInitialize(String callbackId) {
            if (callbackId == null || callbackId.length() > 128) return;
            new Thread(() -> {
                String payload = ""; String error = null;
                try { payload = CloudAuth.ensureSession(MainActivity.this).toJson().toString(); }
                catch (Throwable failure) { error = failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage(); }
                final String resultPayload = payload; final String resultError = error;
                runOnUiThread(() -> {
                    if (webView == null) return;
                    String script = "window.DexkCloudNative&&window.DexkCloudNative.complete(" + JSONObject.quote(callbackId) + "," + JSONObject.quote(resultPayload) + "," + (resultError == null ? "null" : JSONObject.quote(resultError)) + ");";
                    webView.evaluateJavascript(script, null);
                });
            }).start();
        }
        @JavascriptInterface public void probeLanCandidates(String callbackId, String candidatesJson) {
            if (callbackId == null || callbackId.length() > 128 || candidatesJson == null || candidatesJson.length() > 32768) return;
            new Thread(() -> {
                String payload = "{}"; String error = null;
                try {
                    JSONArray candidates = new JSONArray(candidatesJson);
                    JSONObject result = new JSONObject();
                    for (int i = 0; i < candidates.length() && i < 8; i++) {
                        JSONObject item = candidates.optJSONObject(i);
                        String raw = item == null ? candidates.optString(i, "") : item.optString("url", "");
                        String safeUrl = validateLanCandidate(raw);
                        if (safeUrl.isEmpty()) continue;
                        Uri uri = Uri.parse(safeUrl);
                        URL helloUrl = new URL("http://" + uri.getHost() + ":45911/api/remote/hello");
                        HttpURLConnection connection = (HttpURLConnection) helloUrl.openConnection();
                        connection.setConnectTimeout(1200);
                        connection.setReadTimeout(1600);
                        connection.setRequestMethod("GET");
                        connection.setRequestProperty("Accept", "application/json");
                        connection.setRequestProperty("User-Agent", "TexiolDexk-Mobile/2.1.0 LAN-Probe");
                        int code = connection.getResponseCode();
                        String body = code >= 200 && code < 300 ? readSmallResponse(connection) : "";
                        connection.disconnect();
                        if (code >= 200 && code < 300) {
                            result.put("url", safeUrl);
                            result.put("reachable", true);
                            try { result.put("active", new JSONObject(body).optBoolean("active", false)); } catch (Throwable ignored) { }
                            break;
                        }
                    }
                    payload = result.toString();
                } catch (Throwable failure) {
                    error = failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage();
                }
                final String resultPayload = payload; final String resultError = error;
                runOnUiThread(() -> {
                    if (webView == null) return;
                    String script = "window.DexkCloudNative&&window.DexkCloudNative.probeComplete(" + JSONObject.quote(callbackId) + "," + JSONObject.quote(resultPayload) + "," + (resultError == null ? "null" : JSONObject.quote(resultError)) + ");";
                    webView.evaluateJavascript(script, null);
                });
            }).start();
        }
        @JavascriptInterface public void showKeyboard() {
            runOnUiThread(() -> {
                if (webView == null) return;
                webView.requestFocus();
                InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (manager != null) manager.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
            });
        }
    }

    private String validateLanCandidate(String raw) {
        try {
            Uri uri = Uri.parse(raw == null ? "" : raw.trim());
            if (!"http".equalsIgnoreCase(uri.getScheme()) || uri.getPort() != 45911) return "";
            String host = uri.getHost();
            if (host == null || !host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return "";
            String[] parts = host.split("\\.");
            int a = Integer.parseInt(parts[0]), b = Integer.parseInt(parts[1]), c = Integer.parseInt(parts[2]), d = Integer.parseInt(parts[3]);
            if (a > 255 || b > 255 || c > 255 || d > 255 || !isLocalIpv4(a, b, c, d)) return "";
            return "http://" + host + ":45911/remote";
        } catch (Throwable ignored) { return ""; }
    }

    private String readSmallResponse(HttpURLConnection connection) throws Exception {
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            char[] buffer = new char[1024]; int n;
            while ((n = reader.read(buffer)) >= 0 && out.length() < 8192) out.append(buffer, 0, n);
        }
        return out.toString();
    }

    private void destroyWebView() {
        if (webView == null) return;
        try {
            webView.stopLoading();
            webView.removeJavascriptInterface("DexkNative");
            webView.destroy();
        } catch (Throwable ignored) { }
        webView = null;
    }

    private void haptic(int milliseconds) {
        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        int duration = Math.max(8, Math.min(milliseconds, 80));
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
        else vibrator.vibrate(duration);
    }

    @SuppressWarnings("deprecation")
    private void enterImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @SuppressWarnings("deprecation")
    private void exitImmersive() { getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE); }

    private void copyText(String value, String message) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Dexk", value));
        toast(message);
    }

    private void openAppSettings() {
        try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
        catch (ActivityNotFoundException ignored) { }
    }

    private EditText editField(String value, String hint) {
        EditText input = new EditText(this);
        input.setText(value);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setTextSize(15);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.rgb(94, 108, 134));
        input.setPadding(dp(15), 0, dp(15), 0);
        input.setBackground(outlined(Color.rgb(13, 20, 34), line, 1, 14));
        return input;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        card.setBackground(outlined(surface, line, 1, 20));
        return card;
    }

    private TextView text(String value, float sp, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans", style));
        return view;
    }

    private Button button(String label, boolean primary) {
        Button view = new Button(this);
        view.setText(label);
        view.setAllCaps(false);
        view.setTextSize(14);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setTextColor(primary ? Color.WHITE : Color.rgb(204, 213, 255));
        view.setBackground(primary ? gradientRounded(new int[]{brand, Color.rgb(124, 58, 237), Color.rgb(37, 99, 235)}, 14) : outlined(surfaceRaised, line, 1, 14));
        view.setPadding(dp(14), 0, dp(14), 0);
        return view;
    }

    private GradientDrawable gradientRounded(int[] colors, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable(GradientDrawable.Orientation.TL_BR, colors);
        drawable.setCornerRadius(dp(Math.round(radiusDp)));
        return drawable;
    }

    private GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(Math.round(radiusDp)));
        return drawable;
    }

    private GradientDrawable outlined(int color, int strokeColor, int strokeDp, float radiusDp) {
        GradientDrawable drawable = rounded(color, radiusDp);
        drawable.setStroke(dp(strokeDp), strokeColor);
        return drawable;
    }

    private LinearLayout.LayoutParams marginTop(int top, int width, int height) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height);
        params.topMargin = top;
        return params;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private int navigationBarHeight() {
        int id = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
    }

    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handlePairingIntent(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            if (webView.canGoBack()) webView.goBack(); else showHome();
        } else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        destroyWebView();
        super.onDestroy();
    }
}

