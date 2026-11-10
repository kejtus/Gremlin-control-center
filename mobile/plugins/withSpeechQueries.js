const { createRunOncePlugin, withAndroidManifest } = require('expo/config-plugins');

/** Widoczność pakietów Google / Xiaomi Speech na HyperOS (Android 11+). */
function withSpeechQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const intents = [
      'android.speech.action.RECOGNIZE_SPEECH',
      'android.speech.RecognitionService',
    ].map((name) => ({
      action: { $: { 'android:name': name } },
    }));
    const packages = [
      'com.google.android.googlequicksearchbox',
      'com.google.android.tts',
      'com.google.android.as',
      'com.xiaomi.mibrain.speech',
      'com.miui.voiceassist',
    ].map((name) => ({
      $: { 'android:name': name },
    }));
    const existing = Array.isArray(manifest.queries)
      ? manifest.queries
      : manifest.queries
        ? [manifest.queries]
        : [];
    const merged = {
      intent: [...(existing[0]?.intent || []), ...intents],
      package: [...(existing[0]?.package || []), ...packages],
    };
    const seenI = new Set();
    merged.intent = merged.intent.filter((it) => {
      const n = it?.action?.$?.['android:name'];
      if (!n || seenI.has(n)) return false;
      seenI.add(n);
      return true;
    });
    const seenP = new Set();
    merged.package = merged.package.filter((p) => {
      const n = p?.$?.['android:name'];
      if (!n || seenP.has(n)) return false;
      seenP.add(n);
      return true;
    });
    manifest.queries = [merged];
    return cfg;
  });
}

module.exports = createRunOncePlugin(withSpeechQueries, 'rpilot-speech-queries', '1.0.1');
