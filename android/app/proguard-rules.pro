# android-1-1 (15 November 2026, docs/android-1-1-report.md §2): the release build is minified by R8.
#
# WHAT IS ALREADY KEPT WITHOUT THIS FILE
#   • @capacitor/android's consumer rules (node_modules/@capacitor/android/capacitor/proguard-rules.pro): every
#     class extending com.getcapacitor.Plugin, whole, and every @PluginMethod / @PermissionCallback /
#     @ActivityCallback method. Capacitor finds plugins by class name (capacitor.plugins.json) and calls their
#     methods by name from JavaScript, so those are the parts R8 must never rename.
#   • proguard-android-optimize.txt: every @android.webkit.JavascriptInterface method (Capacitor's
#     MessageHandler, the JS-to-native bridge), Parcelables, enums, native methods, View setters.
#   • Manifest entries (activities, services, receivers, providers) via AAPT's generated rules: MainActivity,
#     the push FirebaseMessagingService, the local-notification receivers.
#
# WHAT THIS FILE ADDS, AND WHY IT IS DELIBERATELY BROAD
# A Capacitor plugin is called by NAME from JavaScript, and its helpers may be reached by reflection or JSON in
# ways no static rule can see. A broken plugin only shows at run time, on the release build, so each package
# below is kept WHOLE. The obfuscation Play measures comes from everything else (AndroidX, Firebase, Kotlin,
# Google Play services), which is most of the DEX.

# Capacitor core: the bridge resolves plugins, handles and method handles reflectively.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }

# The plugins in the Android build (capacitor.config.ts android.includePlugins).
-keep class com.capacitorjs.plugins.** { *; }                   # app, local-notifications, network, preferences, push-notifications
-keep class com.capacitorjs.community.plugins.** { *; }         # bluetooth-le (kitchen printer over Bluetooth)
-keep class com.getcapacitor.community.keepawake.** { *; }      # keep-awake
-keep class com.aparajita.capacitor.biometricauth.** { *; }     # biometric unlock
-keep class com.hatchgrab.netprinter.** { *; }                  # @hatchgrab/net-printer (network kitchen printer)

# The app shell (MainActivity owns insets and the system-bar appearance).
-keep class com.hatchgrab.app.** { *; }

# Any other JavaScript interface, should one be added.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Readable stack traces: keep line numbers (the mapping turns names back; this keeps the lines).
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile
