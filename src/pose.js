/** Loads real Google MediaPipe only after explicit user action. Supports local offline model & fallback. */
const VERSION = '0.10.22';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let modulePromise;

export async function resolveModelAssets() {
  const localModel = '/models/pose_landmarker_lite.task';
  let modelPath = REMOTE_MODEL;
  let wasmPath = `${CDN}/wasm`;
  let isLocal = false;

  try {
    const res = await fetch(localModel, { method: 'HEAD' });
    if (res.ok) {
      modelPath = localModel;
      isLocal = true;
    }
  } catch {}

  try {
    const res = await fetch('/models/wasm/vision_wasm_internal.wasm', { method: 'HEAD' });
    if (res.ok) {
      wasmPath = '/models/wasm';
    }
  } catch {}

  return { modelPath, wasmPath, isLocal };
}

export async function createPoseLandmarker(options = {}) {
  const timeoutMs = options.timeoutMs ?? 18000;

  const initPromise = (async () => {
    modulePromise ||= import(`${CDN}/+esm`);
    let visionModule;
    try {
      visionModule = await modulePromise;
    } catch (error) {
      modulePromise = null;
      throw new Error(`MediaPipe 运行库加载失败（请检查网络或 CDN 访问）：${error.message}`);
    }

    const { FilesetResolver, PoseLandmarker } = visionModule;
    const { modelPath, wasmPath, isLocal } = await resolveModelAssets();

    let wasm;
    try {
      wasm = await FilesetResolver.forVisionTasks(wasmPath);
    } catch {
      wasm = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    }

    const detectorOptions = {
      baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55
    };
    const detector = await PoseLandmarker.createFromOptions(wasm, detectorOptions);
    return {
      detector,
      connections: PoseLandmarker.POSE_CONNECTIONS,
      isLocalModel: isLocal,
      modelPath
    };
  })();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('模型资源下载超时（可能受校园网或远程连接限制），建议运行 python scripts/download_models.py 启用本地模型，或直接使用独立的模拟演示模式。'));
    }, timeoutMs);
  });

  return Promise.race([initPromise, timeoutPromise]);
}

export const MEDIAPIPE_DETAILS = {
  version: VERSION,
  model: REMOTE_MODEL,
  localModelPath: '/models/pose_landmarker_lite.task',
  runtime: CDN
};
