# -*- coding: utf-8 -*-
import os
import json
import argparse
import numpy as np


LABEL_MAP = {
    "noaction": 0,
    "put down sleeves": 1,
    "hands around neck": 2,
    "warm hands": 3,
    "folded arm": 4,
    "getting dressed": 5,
    "shoulder shaking": 6,
    "wrapping clothes": 7,
    "rubbing": 8,
    "scratch head": 9,
    "roll up sleeves": 10,
    "take off clothes": 11,
    "hold cooler": 12,
    "Fanning": 13,
    "shaking T-shirt": 14,
    "wiping sweat": 15,
    "splayed posture": 16
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--feature_path", type=str, required=True, help="输入特征 .npy 文件路径")
    parser.add_argument("--model_path", type=str, required=True, help=".h5 分类模型路径")
    args = parser.parse_args()

    if not os.path.isfile(args.feature_path):
        raise FileNotFoundError(f"未找到特征文件：{args.feature_path}")

    if not os.path.isfile(args.model_path):
        raise FileNotFoundError(f"未找到分类模型：{args.model_path}")

    # 这里放在子进程里导入 TensorFlow
    from tensorflow.keras.models import load_model

    feature_seq = np.load(args.feature_path).astype(np.float32)  # (80, 512)
    if feature_seq.ndim != 2:
        raise ValueError(f"feature_seq 维度错误：{feature_seq.shape}")

    x = np.expand_dims(feature_seq, axis=0)  # (1, 80, 512)

    # 推理时不需要加载训练时的 optimizer / compile 信息
    # model = load_model(args.model_path)
    model = load_model(args.model_path, compile=False)
    
    probs = model.predict(x, verbose=0)[0]

    pred_id = int(np.argmax(probs))
    confidence = float(probs[pred_id])

    id2label = {v: k for k, v in LABEL_MAP.items()}
    pred_label = id2label.get(pred_id, f"class_{pred_id}")

    prob_dict = {
        id2label.get(i, f"class_{i}"): float(probs[i])
        for i in range(len(probs))
    }

    result = {
        "pred_id": pred_id,
        "pred_label": pred_label,
        "confidence": confidence,
        "probabilities": prob_dict
    }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()