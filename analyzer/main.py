import io
import math
import os
import tempfile
from datetime import datetime
from typing import Dict, List, Tuple, Any

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    import mediapipe as mp  # type: ignore
    mp_pose = mp.solutions.pose  # type: ignore
except Exception:
    mp = None  # type: ignore
    mp_pose = None  # type: ignore

app = FastAPI(title="Asana Pose Analyzer", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def compute_angle(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> float:
    """Compute the angle ABC (at point b) in degrees using vector math."""
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    ba = a - b
    bc = c - b
    dot_product = np.dot(ba, bc)
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba == 0 or norm_bc == 0:
        return float("nan")
    cosine_angle = np.clip(dot_product / (norm_ba * norm_bc), -1.0, 1.0)
    angle = math.degrees(math.acos(cosine_angle))
    return float(angle)


def line_angle_degrees(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """Angle of the vector p1->p2 relative to horizontal axis in degrees (0=right, 90=up)."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    angle_rad = math.atan2(-dy, dx)  # invert y because image y increases downward
    angle_deg = math.degrees(angle_rad)
    if angle_deg < 0:
        angle_deg += 360
    return angle_deg


POSE_LANDMARKS = {
    'nose': 0,
    'left_eye_inner': 1,
    'left_eye': 2,
    'left_eye_outer': 3,
    'right_eye_inner': 4,
    'right_eye': 5,
    'right_eye_outer': 6,
    'left_ear': 7,
    'right_ear': 8,
    'mouth_left': 9,
    'mouth_right': 10,
    'left_shoulder': 11,
    'right_shoulder': 12,
    'left_elbow': 13,
    'right_elbow': 14,
    'left_wrist': 15,
    'right_wrist': 16,
    'left_pinky': 17,
    'right_pinky': 18,
    'left_index': 19,
    'right_index': 20,
    'left_thumb': 21,
    'right_thumb': 22,
    'left_hip': 23,
    'right_hip': 24,
    'left_knee': 25,
    'right_knee': 26,
    'left_ankle': 27,
    'right_ankle': 28,
    'left_heel': 29,
    'right_heel': 30,
    'left_foot_index': 31,
    'right_foot_index': 32,
}


def extract_keypoints(image_bgr: np.ndarray) -> Dict[str, Dict[str, float]]:
    if mp_pose is None:
        return {}
    with mp_pose.Pose(static_image_mode=True, model_complexity=1, enable_segmentation=False) as pose:
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        results = pose.process(image_rgb)
        if not results.pose_landmarks:
            return {}
        h, w, _ = image_bgr.shape
        keypoints: Dict[str, Dict[str, float]] = {}
        for name, idx in POSE_LANDMARKS.items():
            lm = results.pose_landmarks.landmark[idx]
            keypoints[name] = {
                'x': lm.x * w,
                'y': lm.y * h,
                'visibility': float(lm.visibility),
            }
        return keypoints


def get_point(kps: Dict[str, Dict[str, float]], name: str) -> Tuple[float, float]:
    v = kps.get(name)
    if not v:
        return (float("nan"), float("nan"))
    return (v['x'], v['y'])


def compute_core_angles(kps: Dict[str, Dict[str, float]]) -> Dict[str, float]:
    angles: Dict[str, float] = {}
    # Elbows
    angles['left_elbow'] = compute_angle(get_point(kps, 'left_shoulder'), get_point(kps, 'left_elbow'), get_point(kps, 'left_wrist'))
    angles['right_elbow'] = compute_angle(get_point(kps, 'right_shoulder'), get_point(kps, 'right_elbow'), get_point(kps, 'right_wrist'))
    # Knees
    angles['left_knee'] = compute_angle(get_point(kps, 'left_hip'), get_point(kps, 'left_knee'), get_point(kps, 'left_ankle'))
    angles['right_knee'] = compute_angle(get_point(kps, 'right_hip'), get_point(kps, 'right_knee'), get_point(kps, 'right_ankle'))
    # Hips (approximate hip flexion: shoulder-hip-knee)
    angles['left_hip'] = compute_angle(get_point(kps, 'left_shoulder'), get_point(kps, 'left_hip'), get_point(kps, 'left_knee'))
    angles['right_hip'] = compute_angle(get_point(kps, 'right_shoulder'), get_point(kps, 'right_hip'), get_point(kps, 'right_knee'))
    # Shoulders: elbow-shoulder-hip (arm elevation/abduction)
    angles['left_shoulder'] = compute_angle(get_point(kps, 'left_elbow'), get_point(kps, 'left_shoulder'), get_point(kps, 'left_hip'))
    angles['right_shoulder'] = compute_angle(get_point(kps, 'right_elbow'), get_point(kps, 'right_shoulder'), get_point(kps, 'right_hip'))
    # Trunk lean relative to vertical: angle between hip->shoulder vector and vertical
    left_shoulder = get_point(kps, 'left_shoulder')
    left_hip = get_point(kps, 'left_hip')
    right_shoulder = get_point(kps, 'right_shoulder')
    right_hip = get_point(kps, 'right_hip')
    # Use mean to reduce noise
    mid_shoulder = ((left_shoulder[0] + right_shoulder[0]) / 2.0, (left_shoulder[1] + right_shoulder[1]) / 2.0)
    mid_hip = ((left_hip[0] + right_hip[0]) / 2.0, (left_hip[1] + right_hip[1]) / 2.0)
    trunk_angle_horiz = line_angle_degrees(mid_hip, mid_shoulder)  # 90~upwards
    trunk_from_vertical = abs(90.0 - trunk_angle_horiz)
    angles['trunk_from_vertical'] = trunk_from_vertical
    # Ankle distance ratio vs hip width
    left_ankle = get_point(kps, 'left_ankle')
    right_ankle = get_point(kps, 'right_ankle')
    hip_width = abs(left_hip[0] - right_hip[0])
    ankle_dist = math.dist(left_ankle, right_ankle) if not (math.isnan(left_ankle[0]) or math.isnan(right_ankle[0])) else float("nan")
    angles['ankle_to_hip_ratio'] = (ankle_dist / hip_width) if hip_width and not math.isnan(ankle_dist) else float("nan")
    return angles


IDEAL_RANGES = {
    'Tadasana': {
        'left_knee': (170, 190),
        'right_knee': (170, 190),
        'left_elbow': (165, 195),
        'right_elbow': (165, 195),
        'left_hip': (170, 190),
        'right_hip': (170, 190),
        'trunk_from_vertical': (0, 10),
        'ankle_to_hip_ratio': (0, 0.4),  # feet roughly together
    },
    'Adho Mukha Svanasana': {  # Downward-Facing Dog
        'left_knee': (170, 190),
        'right_knee': (170, 190),
        'left_elbow': (170, 190),
        'right_elbow': (170, 190),
        'left_hip': (80, 110),  # hip flexion approximate
        'right_hip': (80, 110),
    },
    'Virabhadrasana II': {
        # One knee bent ~90, the other straight; we'll evaluate both and accept if either knee ~90 and other ~180
        'left_shoulder': (80, 110),  # arms roughly horizontal
        'right_shoulder': (80, 110),
    },
}


def personalize_range(rng: Tuple[float, float], flexibility: str = 'medium') -> Tuple[float, float]:
    lo, hi = rng
    if flexibility == 'low':
        return (lo - 10.0, hi + 10.0)
    if flexibility == 'high':
        return (lo - 5.0, hi + 5.0)
    return (lo - 7.0, hi + 7.0)


def within(v: float, rng: Tuple[float, float]) -> bool:
    return not (math.isnan(v) or v < rng[0] or v > rng[1])


def classify_asana(kps: Dict[str, Dict[str, float]], angles: Dict[str, float]) -> Tuple[str, float]:
    """Very simple rule-based classifier for MVP."""
    # Heuristics for three poses
    # 1) Downward Dog if hips ~90 and both knees and elbows straight
    hip_ok = (80 <= angles.get('left_hip', 999) <= 110) and (80 <= angles.get('right_hip', 999) <= 110)
    knees_straight = (angles.get('left_knee', 0) >= 165) and (angles.get('right_knee', 0) >= 165)
    elbows_straight = (angles.get('left_elbow', 0) >= 165) and (angles.get('right_elbow', 0) >= 165)
    if hip_ok and knees_straight and elbows_straight:
        # confidence increases when closer to hip 90
        hip_center = 100 - abs(((angles['left_hip'] + angles['right_hip']) / 2) - 95)
        return ('Adho Mukha Svanasana', max(0.5, min(0.95, hip_center / 100)))

    # 2) Warrior II if one knee ~90 and other ~180 and arms abducted ~90
    left_knee_90 = 80 <= angles.get('left_knee', 999) <= 110
    right_knee_90 = 80 <= angles.get('right_knee', 999) <= 110
    other_straight = (angles.get('left_knee', 0) >= 165) or (angles.get('right_knee', 0) >= 165)
    shoulders_level = (80 <= angles.get('left_shoulder', 999) <= 110) and (80 <= angles.get('right_shoulder', 999) <= 110)
    if (left_knee_90 or right_knee_90) and other_straight and shoulders_level:
        knee_target = 100 - abs(((angles.get('left_knee', 90) if left_knee_90 else angles.get('right_knee', 90)) - 90))
        return ('Virabhadrasana II', max(0.5, min(0.9, knee_target / 100)))

    # 3) Tadasana if knees straight, elbows straight, trunk vertical, feet together-ish
    feet_together = angles.get('ankle_to_hip_ratio', 1.0) <= 0.5
    trunk_upright = angles.get('trunk_from_vertical', 999) <= 12
    if knees_straight and elbows_straight and trunk_upright and feet_together:
        upright_score = 100 - abs(angles.get('trunk_from_vertical', 0))
        return ('Tadasana', max(0.4, min(0.85, upright_score / 100)))

    # Fallback: choose the closest match by minimal total deviation to ranges
    candidates = ['Tadasana', 'Adho Mukha Svanasana', 'Virabhadrasana II']
    best_name = 'Unknown'
    best_score = -1.0
    for name in candidates:
        ranges = IDEAL_RANGES[name]
        deviations: List[float] = []
        for k, rng in ranges.items():
            v = angles.get(k, float('nan'))
            if math.isnan(v):
                continue
            lo, hi = rng
            if v < lo:
                deviations.append(lo - v)
            elif v > hi:
                deviations.append(v - hi)
            else:
                deviations.append(0.0)
        if deviations:
            score = 1.0 / (1.0 + (sum(deviations) / (len(deviations) * 50.0)))  # heuristic
            if score > best_score:
                best_score = score
                best_name = name
    if best_name == 'Unknown':
        return ('Unknown', 0.2)
    return (best_name, max(0.3, min(0.8, best_score)))


def validate_pose(asana_name: str, angles: Dict[str, float], flexibility: str = 'medium') -> Dict[str, Any]:
    ranges = IDEAL_RANGES.get(asana_name, {})
    validation: Dict[str, Any] = {}
    for metric, base_rng in ranges.items():
        rng = personalize_range(base_rng, flexibility)
        v = angles.get(metric, float('nan'))
        ok = within(v, rng)
        delta = 0.0 if math.isnan(v) else (0 if ok else (rng[0] - v if v < rng[0] else v - rng[1]))
        validation[metric] = {
            'angle': v,
            'ideal_range': rng,
            'delta': delta,
            'ok': ok,
        }
    # Special logic for Warrior II: one knee ~90 and the other ~180
    if asana_name == 'Virabhadrasana II':
        left_knee = angles.get('left_knee', float('nan'))
        right_knee = angles.get('right_knee', float('nan'))
        knee_90_ok = (80 <= left_knee <= 110) or (80 <= right_knee <= 110)
        knee_straight_ok = (left_knee >= 165) or (right_knee >= 165)
        validation['knees_combo'] = {
            'angle': (left_knee, right_knee),
            'ideal': ('one ~90', 'other ~180'),
            'ok': bool(knee_90_ok and knee_straight_ok),
        }
    return validation


def micro_adjustments(asana: str, validation: Dict[str, Any]) -> List[str]:
    suggestions: List[str] = []
    def add(msg: str):
        suggestions.append(msg)

    def out_of(metric: str) -> Tuple[bool, float]:
        v = validation.get(metric, {})
        return (not v.get('ok', True), v.get('delta', 0.0))

    if asana == 'Adho Mukha Svanasana':
        bad, _ = out_of('left_hip')
        if bad:
            add("Lift hips to lengthen spine; aim for ~90° at hips.")
        bad, _ = out_of('right_hip')
        if bad:
            add("Pike more at hips; press thighs back.")
        bad, _ = out_of('left_knee')
        if bad:
            add("Straighten left leg; press left heel toward mat.")
        bad, _ = out_of('right_knee')
        if bad:
            add("Straighten right leg; root right heel.")
        bad, _ = out_of('left_elbow')
        if bad:
            add("Firm arms; externally rotate shoulders and spin triceps down.")
        bad, _ = out_of('right_elbow')
        if bad:
            add("Engage arms; wrap outer upper arms toward floor.")
    elif asana == 'Tadasana':
        bad, _ = out_of('trunk_from_vertical')
        if bad:
            add("Stack ears over shoulders over hips; lengthen through crown.")
        bad, _ = out_of('left_knee')
        if bad:
            add("Engage left quadriceps to fully extend the knee.")
        bad, _ = out_of('right_knee')
        if bad:
            add("Engage right quadriceps; lift kneecaps.")
        bad, _ = out_of('ankle_to_hip_ratio')
        if bad:
            add("Bring inner feet to touch or hip-width parallel.")
    elif asana == 'Virabhadrasana II':
        knees = validation.get('knees_combo', {}).get('ok', True)
        if not knees:
            add("Bend front knee to ~90° and straighten back leg.")
        bad, _ = out_of('left_shoulder')
        if bad:
            add("Reach arms long; keep shoulders level and away from ears.")
        bad, _ = out_of('right_shoulder')
        if bad:
            add("Broaden collarbones; extend through fingertips.")
    else:
        # Generic guidance
        for metric, v in validation.items():
            if isinstance(v, dict) and not v.get('ok', True):
                add(f"Adjust {metric.replace('_', ' ')} toward ideal range {v.get('ideal_range')}")
    return suggestions


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    age: int = Form(30),
    flexibility: str = Form('medium'),  # 'low'|'medium'|'high'
    goal: str = Form('alignment'),
):
    try:
        content = await file.read()
        np_arr = np.frombuffer(content, np.uint8)
        img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image"})

        kps = extract_keypoints(img_bgr)
        if not kps:
            if mp_pose is None:
                return JSONResponse(status_code=503, content={"error": "Pose engine unavailable: install mediapipe."})
            return JSONResponse(status_code=422, content={"error": "No pose detected"})

        angles = compute_core_angles(kps)
        asana_name, score = classify_asana(kps, angles)
        validation = validate_pose(asana_name, angles, flexibility)
        suggestions = micro_adjustments(asana_name, validation)

        return {
            'asana_name': asana_name,
            'score': score,
            'angles': angles,
            'validation': validation,
            'suggestions': suggestions,
            'keypoints': kps,
            'profile': {'age': age, 'flexibility': flexibility, 'goal': goal},
            'created_at': datetime.utcnow().isoformat() + 'Z',
            'version': '0.1.0',
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/health")
async def health():
    return {"status": "ok", "service": "pose-analyzer", "version": "0.1.0"}
