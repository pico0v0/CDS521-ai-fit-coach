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
  const timeoutMs = options.timeoutMs ?? 120000;
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  const initPromise = (async () => {
    const startTime = performance.now();
    onStatus('正在载入 AI 姿态计算引擎核心组件…');
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
    onStatus('正在检查模型与 WebAssembly 引擎…');
    const { modelPath, wasmPath, isLocal } = await resolveModelAssets();

    let wasm;
    try {
      onStatus('正在下载与初始化 WebAssembly 运行时（首次下载后将永久缓存）…');
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

    onStatus('正在载入离线骨骼姿态检测神经网络…');
    const detectorOptions = {
      baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55
    };
    const detector = await PoseLandmarker.createFromOptions(wasm, detectorOptions);
    const cost = Math.round(performance.now() - startTime);
    console.info(`[MediaPipe] 模型加载成功，耗时 ${cost}ms，来源: ${isLocal ? '本地私有服务器' : '在线CDN'}`);

    return {
      detector,
      connections: PoseLandmarker.POSE_CONNECTIONS,
      isLocalModel: isLocal,
      modelPath
    };
  })();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('模型资源下载或初始化超时（已等待超过 2 分钟，当前网络速度可能较慢），建议保持网络畅通重试，或使用模拟演示模式。'));
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
