/**
 * Runs entirely inside a hidden WebView — no native module, so this stays
 * Expo Go compatible (see README's "third option" for why this differs from
 * the react-native-vision-camera/ML-Kit paths, which need a dev client).
 *
 * Loads MediaPipe Tasks Vision's WASM build from jsdelivr and Google's public
 * BlazeFace model, decodes each posted frame into an <img>, and runs
 * synchronous, on-device detection — no network round trip per frame, unlike
 * the OpenAI vision checker.
 */
export const MEDIAPIPE_FACE_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:#000;">
<script type="module">
  import { FilesetResolver, FaceDetector } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

  let detector = null;
  let ready = false;

  function post(message) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  async function init() {
    try {
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          // CPU is slower than GPU but works on far more WebView/device
          // combinations — flip to "GPU" once you've confirmed your target
          // devices' WebViews support the WebGL path MediaPipe needs.
          delegate: "CPU",
        },
        runningMode: "IMAGE",
      });
      ready = true;
      post({ type: "ready" });
    } catch (err) {
      post({ type: "error", error: String(err && err.message ? err.message : err) });
    }
  }

  function handleFrame(imageBase64) {
    if (!ready || !detector) {
      post({ type: "error", error: "MediaPipe face detector is not ready yet." });
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const result = detector.detect(img);
        post({ type: "result", count: result.detections ? result.detections.length : 0 });
      } catch (err) {
        post({ type: "error", error: String(err && err.message ? err.message : err) });
      }
    };
    img.onerror = () => post({ type: "error", error: "Could not decode the captured frame." });
    img.src = "data:image/jpeg;base64," + imageBase64;
  }

  function onMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data && data.type === "frame" && typeof data.imageBase64 === "string") {
      handleFrame(data.imageBase64);
    }
  }

  // react-native-webview delivers messages on \`document\` on Android and
  // \`window\` on iOS — listening on both is the documented cross-platform way.
  document.addEventListener("message", onMessage);
  window.addEventListener("message", onMessage);

  init();
</script>
</body>
</html>`;
