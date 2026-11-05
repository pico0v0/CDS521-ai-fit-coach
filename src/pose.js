/** Loads real Google MediaPipe only after explicit user action. No video upload. */
const VERSION = '0.10.22';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let modulePromise;

export async function createPoseLandmarker() {
  modulePromise ||= import(`${CDN}/+esm`);
  let visionModule;
  try { visionModule = await modulePromise; }
  catch (error) { modulePromise = null; throw error; } // retry after a network outage
  const { FilesetResolver, PoseLandmarker } = visionModule;
  const wasm = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const options = { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
    runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55, minTrackingConfidence: 0.55 };
  const detector = await PoseLandmarker.createFromOptions(wasm, options);
  return { detector, connections: PoseLandmarker.POSE_CONNECTIONS };
}
export const MEDIAPIPE_DETAILS = { version: VERSION, model: MODEL, runtime: CDN };
