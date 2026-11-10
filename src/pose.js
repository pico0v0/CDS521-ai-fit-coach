/** Loads Google MediaPipe Pose Landmarker.
 * Prioritizes self-hosted local server assets (/models/...) to eliminate external CDN latency and network blocks.
 */
const VERSION = '0.10.21';
const LOCAL_ESM = '/models/tasks-vision.mjs';
const LOCAL_WASM = '/models/wasm';
const LOCAL_MODEL = '/models/pose_landmarker_lite.task';

const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let modulePromise;

export async function resolveModelAssets() {
  let modelPath = LOCAL_MODEL;
  let wasmPath = LOCAL_WASM;
  let isLocal = true;

  try {
    const res = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    if (!res.ok) {
      modelPath = REMOTE_MODEL;
      isLocal = false;
    }
  } catch {
    modelPath = REMOTE_MODEL;
    isLocal = false;
  }

  try {
    const res = await fetch('/models/wasm/vision_wasm_internal.wasm', { method: 'HEAD' });
    if (!res.ok) {
      wasmPath = `${CDN}/wasm`;
    }
  } catch {
    wasmPath = `${CDN}/wasm`;
  }

  return { modelPath, wasmPath, isLocal };
}

export async function createPoseLandmarker(options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;

  const initPromise = (async () => {
    modulePromise ||= (async () => {
      // 1. First priority: load from local self-hosted server bundle
      try {
        const mod = await import(LOCAL_ESM);
        if (mod && mod.PoseLandmarker) return mod;
      } catch (eLocal) {
        console.warn('Local tasks-vision.mjs failed, trying CDN fallback...', eLocal);
      }
      // 2. Fallbacks for environments where local bundle might be missing
      try {
        return await import(`${CDN}/+esm`);
      } catch (e1) {
        try {
          return await import(`https://unpkg.com/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`);
        } catch (e2) {
          return await import(`https://esm.sh/@mediapipe/tasks-vision@${VERSION}`);
        }
      }
    })();
    let visionModule;
    try {
      visionModule = await modulePromise;
    } catch (error) {
      modulePromise = null;
      throw new Error(`MediaPipe 运行库加载失败（首度加载 ESM 运行时需网络连接，请检查网络访问或在离线时使用模拟模式）：${error.message}`);
    }

    const { FilesetResolver, PoseLandmarker } = visionModule;
    const { modelPath, wasmPath, isLocal } = await resolveModelAssets();

    let wasm;
    try {
      wasm = await FilesetResolver.forVisionTasks(wasmPath);
    } catch {
      try {
        wasm = await FilesetResolver.forVisionTasks(LOCAL_WASM);
      } catch {
        try {
          wasm = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
        } catch {
          wasm = await FilesetResolver.forVisionTasks(`https://unpkg.com/@mediapipe/tasks-vision@${VERSION}/wasm`);
        }
      }
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
      reject(new Error('模型资源加载超时（可能受校园网或远程连接限制），建议确认服务器模型文件完整，或使用独立的模拟演示模式。'));
    }, timeoutMs);
  });

  return Promise.race([initPromise, timeoutPromise]);
}

export const MEDIAPIPE_DETAILS = {
  version: VERSION,
  model: LOCAL_MODEL,
  localModelPath: LOCAL_MODEL,
  runtime: LOCAL_ESM
};
