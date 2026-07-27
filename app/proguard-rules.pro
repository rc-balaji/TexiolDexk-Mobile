# Keep WebView JavaScript bridge methods.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve the launcher activity and Android component constructors.
-keep public class com.texiol.dexk.MainActivity { public <init>(); }
-keep public class * extends android.app.Activity

# Google Play services and ML Kit publish their own consumer rules.
-dontwarn com.google.mlkit.**

# Preserve the local cloud identity helper and EdDSA provider classes.
-keep class com.texiol.dexk.CloudAuth { *; }
-keep class net.i2p.crypto.eddsa.** { *; }
-dontwarn net.i2p.crypto.eddsa.**
