"""
Dataset Preprocessing & Deduplication Tool (Step 2 of AI Pipeline)

Actions:
1. Deduplication: Removes duplicate or near-identical CAPTCHA images using Perceptual Hashing (dHash).
2. Structural Sharpening: Strips color filters and sharpens object outlines using multi-channel edge extraction.
3. Blur / Quality Filter: Discards low-contrast or empty images.

Usage:
  py clean_dataset.py
"""

import os
import json
import cv2
import numpy as np

DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset")
CLEANED_DIR = os.path.join(os.path.dirname(__file__), "dataset_cleaned")

def calculate_dhash(img, hash_size=8):
    """Calculates Difference Hash (dHash) for perceptual image deduplication."""
    resized = cv2.resize(img, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    return sum([2 ** i for (i, v) in enumerate(diff.flatten()) if v])

def hamming_distance(h1, h2):
    """Calculates bitwise distance between two hashes."""
    return bin(h1 ^ h2).count('1')

def simplify_structure(img):
    """Removes color & background noise, sharpening object outlines."""
    if len(img.shape) == 3 and img.shape[2] == 4:
        bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    elif len(img.shape) == 3:
        bgr = img
    else:
        bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    # Multi-channel edge extraction for color-invariant outlines
    channel_edges = []
    for c in range(3):
        eq = cv2.equalizeHist(bgr[:, :, c])
        edge = cv2.Canny(eq, 40, 120)
        channel_edges.append(edge)

    combined = np.maximum(channel_edges[0], np.maximum(channel_edges[1], channel_edges[2]))
    # Gaussian blur to smooth fine noise while preserving shape contours
    return cv2.GaussianBlur(combined, (3, 3), 0)

def clean_and_deduplicate():
    if not os.path.exists(DATASET_DIR):
        print(f"[Clean Error] Dataset directory '{DATASET_DIR}' not found.")
        return

    os.makedirs(CLEANED_DIR, exist_ok=True)
    files = os.listdir(DATASET_DIR)
    meta_files = [f for f in files if f.endswith("_meta.json")]

    seen_hashes = []
    kept_count = 0
    duplicate_count = 0
    low_quality_count = 0

    print(f"[Step 2] Processing {len(meta_files)} raw dataset samples...")

    for mf in meta_files:
        path = os.path.join(DATASET_DIR, mf)
        with open(path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        base_id = mf.replace("_meta.json", "")
        bg_path = os.path.join(DATASET_DIR, f"{base_id}_bg.png")
        slide_path = os.path.join(DATASET_DIR, f"{base_id}_slide.png")

        if not (os.path.exists(bg_path) and os.path.exists(slide_path)):
            continue

        bg_img = cv2.imread(bg_path)
        slide_img = cv2.imread(slide_path)

        if bg_img is None or slide_img is None:
            continue

        # 1. Deduplication check via dHash
        bg_gray = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
        img_hash = calculate_dhash(bg_gray)

        is_duplicate = False
        for existing_hash in seen_hashes:
            if hamming_distance(img_hash, existing_hash) <= 4:  # Near-identical images
                is_duplicate = True
                break

        if is_duplicate:
            duplicate_count += 1
            continue

        # 2. Quality / Contrast Filter
        if np.std(bg_gray) < 15:  # Low contrast / blank image
            low_quality_count += 1
            continue

        # 3. Simplify structure (Edge Sharpening & Color Removal)
        clean_bg = simplify_structure(bg_img)
        clean_slide = simplify_structure(slide_img)

        # Save to dataset_cleaned/
        seen_hashes.append(img_hash)
        kept_count += 1

        cv2.imwrite(os.path.join(CLEANED_DIR, f"{base_id}_bg.png"), clean_bg)
        cv2.imwrite(os.path.join(CLEANED_DIR, f"{base_id}_slide.png"), clean_slide)
        with open(os.path.join(CLEANED_DIR, f"{base_id}_meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    print("\n--- [Step 2 Cleaning Summary] ---")
    print(f"Total Processed: {len(meta_files)}")
    print(f"Duplicates Removed: {duplicate_count}")
    print(f"Low Quality Filtered: {low_quality_count}")
    print(f"Cleaned Samples Saved: {kept_count} -> ./dataset_cleaned/\n")

if __name__ == "__main__":
    clean_and_deduplicate()
