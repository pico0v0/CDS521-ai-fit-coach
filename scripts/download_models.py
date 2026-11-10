#!/usr/bin/env python3
"""Downloads official Google MediaPipe Pose Landmarker model and WASM runtime for offline use.

Run: python scripts/download_models.py
"""
from pathlib import Path
import urllib.request
import hashlib
import sys

BASE = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE / 'models'
WASM_DIR = MODELS_DIR / 'wasm'

RESOURCES = [
    {
        'name': 'pose_landmarker_lite.task',
        'url': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        'dest': MODELS_DIR / 'pose_landmarker_lite.task',
        'desc': 'Google MediaPipe Pose Landmarker Lite Model (float16)'
    },
    {
        'name': 'tasks-vision.mjs',
        'url': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs',
        'dest': MODELS_DIR / 'tasks-vision.mjs',
        'desc': 'MediaPipe Vision Tasks ESM Bundle (Offline Runtime)'
    },
    {
        'name': 'vision_wasm_internal.wasm',
        'url': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm/vision_wasm_internal.wasm',
        'dest': WASM_DIR / 'vision_wasm_internal.wasm',
        'desc': 'MediaPipe Vision Tasks WASM Runtime (SIMD)'
    },
    {
        'name': 'vision_wasm_internal.js',
        'url': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm/vision_wasm_internal.js',
        'dest': WASM_DIR / 'vision_wasm_internal.js',
        'desc': 'MediaPipe Vision Tasks WASM Loader (SIMD)'
    },
    {
        'name': 'vision_wasm_nosimd_internal.wasm',
        'url': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm/vision_wasm_nosimd_internal.wasm',
        'dest': WASM_DIR / 'vision_wasm_nosimd_internal.wasm',
        'desc': 'MediaPipe Vision Tasks WASM Runtime (No-SIMD Fallback)'
    },
    {
        'name': 'vision_wasm_nosimd_internal.js',
        'url': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm/vision_wasm_nosimd_internal.js',
        'dest': WASM_DIR / 'vision_wasm_nosimd_internal.js',
        'desc': 'MediaPipe Vision Tasks WASM Loader (No-SIMD Fallback)'
    }
]

def download_file(url, dest, desc):
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f'--> 正在下载 {desc}...')
    print(f'    来源: {url}')
    print(f'    目标: {dest.relative_to(BASE)}')

    def reporthook(count, block_size, total_size):
        if total_size > 0:
            percent = int(count * block_size * 100 / total_size)
            downloaded_mb = (count * block_size) / (1024 * 1024)
            total_mb = total_size / (1024 * 1024)
            sys.stdout.write(f'\r    进度: {percent}% ({downloaded_mb:.2f} MB / {total_mb:.2f} MB)')
            sys.stdout.flush()

    try:
        urllib.request.urlretrieve(url, dest, reporthook=reporthook)
        print()
        hasher = hashlib.sha256()
        with open(dest, 'rb') as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        print(f'    ✓ 完成 (SHA256: {hasher.hexdigest()[:16]}...)')
        return True
    except Exception as e:
        print(f'\n    ✗ 下载失败: {e}')
        print('    提示: 需连接公网或检查防火墙。若无法联网，请使用网页内置的模拟演示模式。')
        return False

def main():
    print('=' * 60)
    print('AI Fit Coach — MediaPipe 离线资源下载工具 (M2-01)')
    print('=' * 60)
    success_count = 0
    for item in RESOURCES:
        if download_file(item['url'], item['dest'], item['desc']):
            success_count += 1
        print()

    if success_count == len(RESOURCES):
        print('🎉 核心模型与 WASM 资产下载成功！')
        print('说明：本地 /models/ 缓存提供 .task 视觉模型与 WASM 算子；首次在未缓存浏览器中运行仍需网络加载 @mediapipe/tasks-vision ESM 运行库。')
        print('课堂演示建议：演示前请提前连接网络打开页面完成首度资源预热缓存，或在离线环境下使用内置的「模拟演示」模式。')
    else:
        print(f'⚠️ 完成 {success_count}/{len(RESOURCES)} 个文件。部分文件下载未完成。')

if __name__ == '__main__':
    main()

