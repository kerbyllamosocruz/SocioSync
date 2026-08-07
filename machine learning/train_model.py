"""
PyTorch Training Script for TikTok Rotate Captcha Orientation Model

Usage:
  py train_model.py
"""

import os
import json
import cv2
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

RAW_DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset")
CLEANED_DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset_cleaned")
DATASET_DIR = CLEANED_DATASET_DIR if os.path.exists(CLEANED_DATASET_DIR) else RAW_DATASET_DIR
MODEL_SAVE_PATH = os.path.join(os.path.dirname(__file__), "tiktok_rotate_model.pth")

class CaptchaDataset(Dataset):
    def __init__(self, dataset_dir, augment_count=20):
        self.samples = []
        files = os.listdir(dataset_dir)
        meta_files = [f for f in files if f.endswith("_meta.json")]

        for mf in meta_files:
            path = os.path.join(dataset_dir, mf)
            with open(path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            
            # Only use samples labeled with true_angle
            if "true_angle" in meta:
                base_id = mf.replace("_meta.json", "")
                bg_path = os.path.join(dataset_dir, f"{base_id}_bg.png")
                slide_path = os.path.join(dataset_dir, f"{base_id}_slide.png")
                if os.path.exists(bg_path) and os.path.exists(slide_path):
                    self.samples.append({
                        "bg": bg_path,
                        "slide": slide_path,
                        "angle": meta["true_angle"]
                    })

        self.augment_count = augment_count
        print(f"[Dataset] Loaded {len(self.samples)} labeled base images. Expanding with {augment_count}x data augmentation...")

    def __len__(self):
        return len(self.samples) * self.augment_count

    def __getitem__(self, idx):
        sample_idx = idx % len(self.samples)
        item = self.samples[sample_idx]

        bg_img = cv2.imread(item["bg"], cv2.IMREAD_GRAYSCALE)
        slide_img = cv2.imread(item["slide"], cv2.IMREAD_GRAYSCALE)

        bg_img = cv2.resize(bg_img, (128, 128))
        slide_img = cv2.resize(slide_img, (128, 128))

        # Data Augmentation: Random extra rotation
        rand_spin = np.random.uniform(0, 360)
        h, w = slide_img.shape
        M = cv2.getRotationMatrix2D((w/2, h/2), rand_spin, 1.0)
        spun_slide = cv2.warpAffine(slide_img, M, (w, h))

        target_angle = (item["angle"] + rand_spin) % 360.0

        # Stack into 2-channel tensor (outer_bg, inner_slide)
        stacked = np.stack([bg_img, spun_slide], axis=0).astype(np.float32) / 255.0
        
        # Convert angle to sin/cos representation for smooth continuous loss
        rad = np.deg2rad(target_angle)
        target_vector = np.array([np.sin(rad), np.cos(rad)], dtype=np.float32)

        return torch.tensor(stacked), torch.tensor(target_vector)

class RotateCNN(nn.Module):
    def __init__(self):
        super(RotateCNN, self).__init__()
        self.features = nn.Sequential(
            nn.Conv2d(2, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),

            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),

            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),
        )
        self.fc = nn.Sequential(
            nn.Linear(128 * 16 * 16, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 2)  # Outputs sin(angle), cos(angle)
        )

    def forward(self, x):
        feat = self.features(x)
        feat = feat.view(feat.size(0), -1)
        out = self.fc(feat)
        return out

def train():
    if not os.path.exists(DATASET_DIR):
        print(f"[Training Error] Dataset directory '{DATASET_DIR}' does not exist.")
        return

    dataset = CaptchaDataset(DATASET_DIR, augment_count=50)
    if len(dataset.samples) == 0:
        print("[Training Error] No labeled samples found! Please open http://127.0.0.1:4782/labeler to label your images first.")
        return

    dataloader = DataLoader(dataset, batch_size=16, shuffle=True)
    model = RotateCNN()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()

    epochs = 15
    print(f"[Training] Starting PyTorch model training for {epochs} epochs...")

    for epoch in range(epochs):
        running_loss = 0.0
        for inputs, targets in dataloader:
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()

        avg_loss = running_loss / len(dataloader)
        print(f"Epoch [{epoch+1}/{epochs}] - Loss: {avg_loss:.5f}")

    torch.save(model.state_dict(), MODEL_SAVE_PATH)
    print(f"[Training Complete] Model saved successfully to: {MODEL_SAVE_PATH}")

if __name__ == "__main__":
    train()
