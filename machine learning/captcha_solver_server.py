"""
High-Precision Local TikTok Captcha Solver Microservice & Dataset Collector
Runs locally on port 4782 using Python, FastAPI & OpenCV.

Features:
- Color-Invariant Multi-Channel Edge Extraction
- 0.5-Degree Sub-Pixel Ring Edge Correlation
- Automatic Dataset Collector (Saves images & JSON metadata to ./dataset/)

Usage:
  py captcha_solver_server.py
"""

import base64
import json
import os
import time
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Color-Invariant TikTok Captcha Solver & Dataset Collector")

DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset")
os.makedirs(DATASET_DIR, exist_ok=True)

class CaptchaPayload(BaseModel):
    puzzleImageB64: str = None
    pieceImageB64: str = None
    outerImageB64: str = None
    innerImageB64: str = None
    puzzle_b64: str = None
    piece_b64: str = None
    outer_b64: str = None
    inner_b64: str = None

def b64_to_cv2(b64_str: str):
    if not b64_str:
        return None
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_bytes = base64.b64decode(b64_str)
    nparr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)

def save_to_dataset(captcha_type: str, img1: np.ndarray, img2: np.ndarray, metadata: dict):
    """Saves timestamped CAPTCHA images and solution metadata to ./dataset/ folder."""
    try:
        timestamp = time.strftime("%Y%m%d_%H%M%S") + f"_{int(time.time()*1000)%1000:03d}"
        prefix = os.path.join(DATASET_DIR, f"{captcha_type}_{timestamp}")
        
        if img1 is not None:
            cv2.imwrite(f"{prefix}_bg.png", img1)
        if img2 is not None:
            cv2.imwrite(f"{prefix}_slide.png", img2)

        with open(f"{prefix}_meta.json", "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
    except Exception as e:
        print(f"[Dataset Warning] Failed to save dataset sample: {e}")

def extract_color_invariant_edges(img):
    """
    Extracts structural edges across all RGB color channels independently.
    Handles color filters, pink/hue shifts, and contrast distortions.
    """
    if img.shape[2] == 4:
        bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    else:
        bgr = img

    channel_edges = []
    for c in range(3):
        channel = bgr[:, :, c]
        eq = cv2.equalizeHist(channel)
        edge = cv2.Canny(eq, 30, 100)
        channel_edges.append(edge)

    combined_edges = np.maximum(channel_edges[0], np.maximum(channel_edges[1], channel_edges[2])).astype(np.float32)
    return cv2.GaussianBlur(combined_edges, (3, 3), 0)

@app.post("/captcha/puzzle")
def solve_puzzle(payload: CaptchaPayload):
    try:
        bg_b64 = payload.puzzleImageB64 or payload.outerImageB64 or payload.puzzle_b64 or payload.outer_b64
        piece_b64 = payload.pieceImageB64 or payload.innerImageB64 or payload.piece_b64 or payload.inner_b64

        bg_img = b64_to_cv2(bg_b64)
        piece_img = b64_to_cv2(piece_b64)

        if bg_img is None or piece_img is None:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")

        bg_edges = extract_color_invariant_edges(bg_img)
        piece_edges = extract_color_invariant_edges(piece_img)
        piece_alpha = piece_img[:, :, 3] if piece_img.shape[2] == 4 else None

        if piece_alpha is not None and np.count_nonzero(piece_alpha) > 0:
            coords = cv2.findNonZero(piece_alpha)
            px, py, pw, ph = cv2.boundingRect(coords)
            cropped_piece = piece_edges[py:py+ph, px:px+pw]
            cropped_alpha = piece_alpha[py:py+ph, px:px+pw]
            mask = (cropped_alpha > 30).astype(np.float32)
        else:
            py, ph = 0, piece_edges.shape[0]
            px, pw = 0, piece_edges.shape[1]
            cropped_piece = piece_edges
            mask = None

        bg_width = bg_img.shape[1]
        suppress_left = min(max(px + pw + 5, 35), int(bg_width * 0.35))

        if mask is not None:
            res = cv2.matchTemplate(bg_edges, cropped_piece, cv2.TM_CCORR_NORMED, mask=mask)
        else:
            res = cv2.matchTemplate(bg_edges, cropped_piece, cv2.TM_CCOEFF_NORMED)

        res[:, :suppress_left] = -1.0
        _, max_val, _, max_loc = cv2.minMaxLoc(res)

        best_x = max_loc[0]
        if best_x < suppress_left:
            best_x = suppress_left

        slide_x_proportion = float(best_x) / float(bg_width)
        confidence_pct = max(0.0, min(100.0, float((max_val + 1.0) / 2.0 * 100)))

        result = {
            "slideXProportion": slide_x_proportion,
            "x": best_x,
            "confidence": confidence_pct
        }

        # Auto-save sample to dataset/
        save_to_dataset("puzzle", bg_img, piece_img, result)

        print(f"[Local Solver] Solved Puzzle: x={best_x}px ({slide_x_proportion:.4f} prop, quality={confidence_pct:.1f}%)")
        return result
    except Exception as e:
        print(f"[Local Solver Error] Puzzle solver error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/captcha/rotate")
def solve_rotate(payload: CaptchaPayload):
    try:
        outer_b64 = payload.outerImageB64 or payload.outerImage or payload.puzzleImageB64 or payload.outer_b64
        inner_b64 = payload.innerImageB64 or payload.innerImage or payload.pieceImageB64 or payload.inner_b64

        outer_img = b64_to_cv2(outer_b64)
        inner_img = b64_to_cv2(inner_b64)

        if outer_img is None or inner_img is None:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")

        outer_edge = extract_color_invariant_edges(outer_img)
        inner_edge = extract_color_invariant_edges(inner_img)

        if outer_edge.shape != inner_edge.shape:
            inner_edge = cv2.resize(inner_edge, (outer_edge.shape[1], outer_edge.shape[0]))

        h, w = outer_edge.shape
        center = (w / 2.0, h / 2.0)
        r_outer = min(h, w) / 2.0
        r_inner = r_outer * 0.35

        outer_polar = cv2.warpPolar(outer_edge, (720, int(r_outer)), center, r_outer, cv2.WARP_POLAR_LINEAR)
        inner_polar = cv2.warpPolar(inner_edge, (720, int(r_outer)), center, r_outer, cv2.WARP_POLAR_LINEAR)

        ring_start = int(r_inner)
        ring_end = int(r_outer)

        outer_ring = outer_polar[ring_start:ring_end, :]
        inner_ring = inner_polar[ring_start:ring_end, :]

        outer_ring_norm = outer_ring - np.mean(outer_ring)
        inner_ring_norm = inner_ring - np.mean(inner_ring)

        best_idx = 0
        max_corr = -1e9

        for idx in range(720):
            shifted_inner = np.roll(inner_ring_norm, shift=idx, axis=1)
            corr = np.sum(outer_ring_norm * shifted_inner)
            if corr > max_corr:
                max_corr = corr
                best_idx = idx

        best_angle = (best_idx / 720.0) * 360.0

        denom = (np.linalg.norm(outer_ring_norm) * np.linalg.norm(inner_ring_norm) + 1e-5)
        raw_ratio = max_corr / denom
        confidence_pct = float(max(0.0, min(100.0, (raw_ratio + 1.0) / 2.0 * 100)))

        result = {
            "angle": float(best_angle),
            "rotation": float(best_angle),
            "confidence": confidence_pct
        }

        # Auto-save sample to dataset/
        save_to_dataset("rotate", outer_img, inner_img, result)

        print(f"[Local Solver] Solved Rotate: angle={best_angle:.1f}° (quality={confidence_pct:.1f}%)")
        return result
    except Exception as e:
        print(f"[Local Solver Error] Rotate solver error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import HTMLResponse

@app.get("/labeler", response_class=HTMLResponse)
def get_labeler():
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>TikTok Captcha Dataset Labeler</title>
        <style>
            body { font-family: sans-serif; background: #111827; color: #fff; text-align: center; padding: 20px; }
            .container { max-width: 480px; margin: auto; background: #1f2937; padding: 24px; border-radius: 16px; }
            .captcha-stage { position: relative; width: 300px; height: 300px; margin: 20px auto; overflow: hidden; border-radius: 50%; border: 2px solid rgba(255,255,255,0.1); }
            .img-outer { width: 300px; height: 300px; clip-path: circle(50%); display: block; object-fit: cover; }
            .img-inner { position: absolute; top: 50%; left: 50%; width: 165px; height: 165px; margin-top: -82.5px; margin-left: -82.5px; clip-path: circle(50%); display: block; object-fit: cover; transform-origin: center center; box-shadow: 0 0 10px rgba(0,0,0,0.5); }
            input[type=range] { width: 90%; height: 12px; margin: 20px 0; accent-color: #ef4444; cursor: pointer; z-index: 100; position: relative; }
            button { background: #6366f1; color: white; border: none; padding: 10px 20px; font-size: 15px; font-weight: 600; border-radius: 8px; cursor: pointer; margin: 6px; }
            button:hover { background: #4f46e5; }
            .btn-skip { background: #4b5563; }
            .btn-skip:hover { background: #374151; }
        </style>
    </head>
    <body>
        <div class="container">
            <h3 style="margin-top:0;">TikTok Rotate Captcha Labeler</h3>
            <div id="status" style="font-size:13px; color:#9ca3af;">Loading dataset...</div>
            
            <div class="captcha-stage" id="img-container">
                <!-- Outer Ring Image -->
                <img id="bg-img" class="img-outer" src="" draggable="false" style="pointer-events:none;" />
                <!-- Inner Rotatable Disc Image -->
                <img id="slide-img" class="img-inner" src="" draggable="false" style="pointer-events:none;" />
            </div>

            <input type="range" id="angle-slider" min="0" max="360" step="0.5" value="0" oninput="updateRotation()" onchange="updateRotation()" />
            <div style="font-size:15px; font-weight:bold; margin-bottom: 12px;">Angle: <span id="angle-val" style="color:#ef4444;">0</span>°</div>
            
            <button onclick="saveLabel()">Save True Label</button>
            <button class="btn-skip" onclick="nextSample()">Skip</button>
        </div>
        <script>
            let currentSample = null;
            const slider = document.getElementById('angle-slider');
            const bgImg = document.getElementById('bg-img');
            const slideImg = document.getElementById('slide-img');
            const angleVal = document.getElementById('angle-val');
            const container = document.getElementById('img-container');

            function updateRotation() {
                const val = parseFloat(slider.value) || 0;
                slideImg.style.transform = `rotate(${val}deg)`;
                bgImg.style.transform = `rotate(${-val}deg)`;
                angleVal.innerText = val.toFixed(1);
            }

            slider.addEventListener('input', updateRotation);
            slider.addEventListener('change', updateRotation);

            // Enable Direct Mouse Dragging on Image Circle
            let isDragging = false;
            let startX = 0;
            let startVal = 0;

            container.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startVal = parseFloat(slider.value) || 0;
                document.body.style.userSelect = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                let newVal = (startVal + dx * 0.8) % 360;
                if (newVal < 0) newVal += 360;
                slider.value = newVal;
                updateRotation();
            });

            window.addEventListener('mouseup', () => {
                isDragging = false;
                document.body.style.userSelect = '';
            });

            let skippedIds = [];

            async function loadSample() {
                const query = skippedIds.length ? `?exclude=${encodeURIComponent(skippedIds.join(','))}` : '';
                const res = await fetch('/api/next_unlabeled' + query);
                const data = await res.json();
                if(!data || !data.sample) {
                    document.getElementById('status').innerText = "All dataset samples labeled! Ready for training.";
                    document.getElementById('img-container').style.display = 'none';
                    return;
                }
                currentSample = data.sample;
                document.getElementById('status').innerText = "Labeling: " + currentSample.id;
                document.getElementById('bg-img').src = "/dataset_file/" + currentSample.bg;
                document.getElementById('slide-img').src = "/dataset_file/" + currentSample.slide;
                slider.value = currentSample.meta.angle || 0;
                updateRotation();
            }

            async function saveLabel() {
                if(!currentSample) return;
                const trueAngle = parseFloat(slider.value);
                await fetch('/api/save_label', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id: currentSample.id, true_angle: trueAngle })
                });
                loadSample();
            }
            function nextSample() {
                if (currentSample) {
                    skippedIds.push(currentSample.id);
                }
                loadSample();
            }
            loadSample();
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/api/next_unlabeled")
def get_next_unlabeled(exclude: str = ""):
    excluded_set = set(exclude.split(",")) if exclude else set()
    files = os.listdir(DATASET_DIR)
    json_files = [f for f in files if f.endswith("_meta.json")]
    for jf in json_files:
        base_id = jf.replace("_meta.json", "")
        if base_id in excluded_set:
            continue
        path = os.path.join(DATASET_DIR, jf)
        with open(path, "r") as f:
            meta = json.load(f)
        if "true_angle" not in meta:
            return {
                "sample": {
                    "id": base_id,
                    "bg": f"{base_id}_bg.png",
                    "slide": f"{base_id}_slide.png",
                    "meta": meta
                }
            }
    return {"sample": None}

from fastapi.responses import FileResponse
@app.get("/dataset_file/{filename}")
def get_dataset_file(filename: str):
    path = os.path.join(DATASET_DIR, filename)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="File not found")

class LabelPayload(BaseModel):
    id: str
    true_angle: float

@app.post("/api/save_label")
def save_label(payload: LabelPayload):
    meta_path = os.path.join(DATASET_DIR, f"{payload.id}_meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r") as f:
            meta = json.load(f)
        meta["true_angle"] = payload.true_angle
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
        print(f"[Dataset Labeler] Saved true_angle={payload.true_angle}° for {payload.id}")
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Metadata file not found")

class HumanSolvePayload(BaseModel):
    outerImageB64: str = None
    innerImageB64: str = None
    true_angle: float

@app.post("/api/save_human_solve")
def save_human_solve(payload: HumanSolvePayload):
    try:
        outer_img = b64_to_cv2(payload.outerImageB64)
        inner_img = b64_to_cv2(payload.innerImageB64)

        if outer_img is None or inner_img is None:
            raise HTTPException(status_code=400, detail="Invalid image payload")

        metadata = {
            "angle": payload.true_angle,
            "true_angle": payload.true_angle,
            "source": "human_telemetry"
        }

        save_to_dataset("rotate", outer_img, inner_img, metadata)
        print(f"[Human Telemetry] Auto-labeled human solve saved! true_angle={payload.true_angle}°")
        return {"status": "success", "true_angle": payload.true_angle}
    except Exception as e:
        print(f"[Human Telemetry Error] Failed to save human solve: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/accounts")
def get_accounts():
    return {"status": "ok", "accounts": []}

@app.post("/mark-done")
def mark_done():
    return {"status": "ok"}

if __name__ == "__main__":
    print("[Local Solver] Running TikTok Captcha Solver & Dataset Labeler on http://127.0.0.1:4782 ...")
    print("[Dataset Labeler] Open http://127.0.0.1:4782/labeler in your browser to label images!")
    uvicorn.run(app, host="127.0.0.1", port=4782)
