# Add project specific ProGuard rules here.

# Keep the JNI bridge object and its native method so the symbol matches the
# JNI function name compiled into libedgevision.so.
-keep class com.edgevision.edgedetection.NativeProcessor { *; }
