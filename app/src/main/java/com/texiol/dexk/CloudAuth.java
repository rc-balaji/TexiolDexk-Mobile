package com.texiol.dexk;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import net.i2p.crypto.eddsa.EdDSAEngine;
import net.i2p.crypto.eddsa.EdDSAPrivateKey;
import net.i2p.crypto.eddsa.EdDSAPublicKey;
import net.i2p.crypto.eddsa.KeyPairGenerator;
import net.i2p.crypto.eddsa.spec.EdDSAGenParameterSpec;
import net.i2p.crypto.eddsa.spec.EdDSANamedCurveSpec;
import net.i2p.crypto.eddsa.spec.EdDSANamedCurveTable;
import net.i2p.crypto.eddsa.spec.EdDSAPrivateKeySpec;

final class CloudAuth {
    static final String SERVER_URL = "https://texiol-dexk-server.rcbalaji2003.workers.dev";
    private static final String PREFS = "texiol_dexk_cloud_v2";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_PUBLIC = "public_key";
    private static final String KEY_PRIVATE_WRAPPED = "private_key_wrapped";
    private static final String WRAP_ALIAS = "texiol_dexk_identity_wrap_v2";
    private static final long REFRESH_MARGIN_MS = 2 * 60 * 1000L;

    static final class Session {
        final String serverUrl;
        final String deviceId;
        final String accessToken;
        final long expiresAtMs;
        final String deviceName;
        final List<String> stunUrls;
        final JSONArray iceServers;

        Session(String serverUrl, String deviceId, String accessToken, long expiresAtMs, String deviceName, List<String> stunUrls, JSONArray iceServers) {
            this.serverUrl = serverUrl;
            this.deviceId = deviceId;
            this.accessToken = accessToken;
            this.expiresAtMs = expiresAtMs;
            this.deviceName = deviceName;
            this.stunUrls = stunUrls;
            this.iceServers = iceServers;
        }

        JSONObject toJson() throws Exception {
            JSONObject out = new JSONObject();
            out.put("serverUrl", serverUrl);
            out.put("deviceId", deviceId);
            out.put("accessToken", accessToken);
            out.put("accessTokenExpiresAt", expiresAtMs / 1000L);
            out.put("deviceName", deviceName);
            out.put("stunUrls", new JSONArray(stunUrls));
            out.put("iceServers", iceServers);
            out.put("platform", "android");
            out.put("clientVersion", "2.1.1");
            return out;
        }
    }

    private static Session cached;

    private CloudAuth() { }

    static synchronized Session ensureSession(Context context) throws Exception {
        long now = System.currentTimeMillis();
        if (cached != null && cached.expiresAtMs - REFRESH_MARGIN_MS > now) return cached;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Identity identity = loadOrCreateIdentity(context, prefs);
        JSONObject challenge = postJson(SERVER_URL + "/v2/auth/challenge", new JSONObject().put("publicKey", identity.publicKey), null);
        String challengeToken = challenge.getString("token");
        String signature = base64Url(sign(identity.privateSeed, challengeToken.getBytes(StandardCharsets.UTF_8)));

        JSONObject proof = new JSONObject();
        proof.put("publicKey", identity.publicKey);
        proof.put("challengeToken", challengeToken);
        proof.put("signature", signature);
        proof.put("deviceName", deviceName(context));
        proof.put("platform", "android");

        String deviceId = prefs.getString(KEY_DEVICE_ID, "");
        JSONObject response;
        if (deviceId == null || deviceId.isEmpty()) {
            response = postJson(SERVER_URL + "/v2/devices/enroll", proof, null);
            deviceId = response.getJSONObject("device").getString("deviceId");
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply();
        } else {
            proof.put("deviceId", deviceId);
            response = postJson(SERVER_URL + "/v2/auth/session", proof, null);
        }

        String token = response.getString("accessToken");
        long expiresAtSeconds = response.optLong("accessTokenExpiresAt", System.currentTimeMillis() / 1000L + 900L);
        Bootstrap bootstrap = bootstrapIce(token);
        cached = new Session(SERVER_URL, deviceId, token, expiresAtSeconds * 1000L, deviceName(context), bootstrap.stunUrls, bootstrap.iceServers);
        return cached;
    }

    static JSONObject presence(Context context, List<String> ids) throws Exception {
        Session session = ensureSession(context);
        JSONArray array = new JSONArray();
        for (String id : ids) if (validDeviceId(id)) array.put(digits(id));
        return postJson(SERVER_URL + "/v2/devices/presence", new JSONObject().put("deviceIds", array), "Bearer " + session.accessToken);
    }

    static boolean validDeviceId(String raw) {
        String value = digits(raw);
        if (value.length() != 12) return false;
        int sum = 0;
        boolean shouldDouble = false;
        for (int i = value.length() - 1; i >= 0; i--) {
            int n = value.charAt(i) - '0';
            if (n < 0 || n > 9) return false;
            if (shouldDouble) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            shouldDouble = !shouldDouble;
        }
        return sum % 10 == 0;
    }

    static String digits(String raw) {
        return raw == null ? "" : raw.replaceAll("\\D", "");
    }

    private static final class Bootstrap {
        final List<String> stunUrls;
        final JSONArray iceServers;
        Bootstrap(List<String> stunUrls, JSONArray iceServers) { this.stunUrls = stunUrls; this.iceServers = iceServers; }
    }

    private static Bootstrap bootstrapIce(String accessToken) {
        ArrayList<String> stun = new ArrayList<>();
        JSONArray ice = new JSONArray();
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(SERVER_URL + "/v2/bootstrap").openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", "TexiolDexk-Mobile/2.1.1");
            if (accessToken != null && !accessToken.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + accessToken);
            String body = readResponse(connection);
            if (connection.getResponseCode() >= 200 && connection.getResponseCode() < 300) {
                JSONObject payload = new JSONObject(body);
                JSONArray values = payload.optJSONArray("stunUrls");
                if (values != null) for (int i = 0; i < values.length(); i++) {
                    String value = values.optString(i, "");
                    if (!value.isEmpty()) stun.add(value);
                }
                JSONArray configured = payload.optJSONArray("iceServers");
                if (configured != null) for (int i = 0; i < configured.length(); i++) {
                    JSONObject server = configured.optJSONObject(i);
                    if (server != null) ice.put(new JSONObject(server.toString()));
                }
            }
            connection.disconnect();
        } catch (Throwable ignored) { }
        if (stun.isEmpty()) stun.add("stun:stun.cloudflare.com:3478");
        if (ice.length() == 0) {
            try { ice.put(new JSONObject().put("urls", new JSONArray(stun))); } catch (Throwable ignored) { }
        }
        return new Bootstrap(stun, ice);
    }

    private static JSONObject postJson(String address, JSONObject body, String authorization) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(15_000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "TexiolDexk-Mobile/2.1.1");
        if (authorization != null) connection.setRequestProperty("Authorization", authorization);
        byte[] encoded = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(encoded.length);
        try (OutputStream output = connection.getOutputStream()) { output.write(encoded); }
        int code = connection.getResponseCode();
        String response = readResponse(connection);
        connection.disconnect();
        if (code < 200 || code >= 300) {
            String message = response;
            try {
                JSONObject error = new JSONObject(response);
                message = error.optString("message", error.optString("error", response));
            } catch (Throwable ignored) { }
            throw new IllegalStateException("Server " + code + ": " + message);
        }
        return new JSONObject(response);
    }

    private static String readResponse(HttpURLConnection connection) throws Exception {
        InputStream stream = connection.getResponseCode() >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream == null) return "";
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int n;
            while ((n = reader.read(buffer)) >= 0) {
                out.append(buffer, 0, n);
                if (out.length() > 262_144) throw new IllegalStateException("Server response too large");
            }
        }
        return out.toString();
    }

    private static final class Identity {
        final byte[] privateSeed;
        final String publicKey;
        Identity(byte[] privateSeed, String publicKey) { this.privateSeed = privateSeed; this.publicKey = publicKey; }
    }

    private static Identity loadOrCreateIdentity(Context context, SharedPreferences prefs) throws Exception {
        String wrapped = prefs.getString(KEY_PRIVATE_WRAPPED, "");
        String publicKey = prefs.getString(KEY_PUBLIC, "");
        if (wrapped != null && !wrapped.isEmpty() && publicKey != null && !publicKey.isEmpty()) {
            byte[] seed = unwrapPrivateSeed(wrapped);
            if (seed.length == 32) return new Identity(seed, publicKey);
        }

        KeyPairGenerator generator = new KeyPairGenerator();
        generator.initialize(new EdDSAGenParameterSpec(EdDSANamedCurveTable.ED_25519), new SecureRandom());
        KeyPair pair = generator.generateKeyPair();
        EdDSAPrivateKey privateKey = (EdDSAPrivateKey) pair.getPrivate();
        EdDSAPublicKey publicPart = (EdDSAPublicKey) pair.getPublic();
        byte[] seed = privateKey.getSeed();
        publicKey = base64Url(publicPart.getAbyte());
        prefs.edit().putString(KEY_PRIVATE_WRAPPED, wrapPrivateSeed(seed)).putString(KEY_PUBLIC, publicKey).apply();
        return new Identity(seed, publicKey);
    }

    private static byte[] sign(byte[] seed, byte[] message) throws Exception {
        EdDSANamedCurveSpec spec = EdDSANamedCurveTable.getByName(EdDSANamedCurveTable.ED_25519);
        EdDSAPrivateKey key = new EdDSAPrivateKey(new EdDSAPrivateKeySpec(seed, spec));
        EdDSAEngine signer = new EdDSAEngine(MessageDigest.getInstance("SHA-512"));
        signer.initSign(key);
        signer.update(message);
        return signer.sign();
    }

    private static SecretKey wrappingKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(WRAP_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(WRAP_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(WRAP_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private static String wrapPrivateSeed(byte[] seed) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, wrappingKey());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(seed);
        byte[] combined = new byte[1 + iv.length + ciphertext.length];
        combined[0] = (byte) iv.length;
        System.arraycopy(iv, 0, combined, 1, iv.length);
        System.arraycopy(ciphertext, 0, combined, 1 + iv.length, ciphertext.length);
        return Base64.encodeToString(combined, Base64.NO_WRAP);
    }

    private static byte[] unwrapPrivateSeed(String wrapped) throws Exception {
        byte[] combined = Base64.decode(wrapped, Base64.NO_WRAP);
        int ivLength = combined[0] & 0xff;
        if (ivLength < 12 || ivLength > 16 || combined.length <= 1 + ivLength) throw new IllegalStateException("Invalid identity vault");
        byte[] iv = new byte[ivLength];
        byte[] ciphertext = new byte[combined.length - 1 - ivLength];
        System.arraycopy(combined, 1, iv, 0, ivLength);
        System.arraycopy(combined, 1 + ivLength, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, wrappingKey(), new GCMParameterSpec(128, iv));
        return cipher.doFinal(ciphertext);
    }

    private static String base64Url(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static String deviceName(Context context) {
        String model = Build.MANUFACTURER + " " + Build.MODEL;
        model = model.trim();
        if (!model.isEmpty()) return model.length() > 80 ? model.substring(0, 80) : model;
        String id = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        return id == null || id.isEmpty() ? "Android controller" : "Android " + id.substring(0, Math.min(8, id.length()));
    }
}
