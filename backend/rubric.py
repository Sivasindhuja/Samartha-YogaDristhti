"""Loads the expert-authored asana rubric and scores estimates against it.

The rubric file (``asanas.json``) is owned by subject matter experts. This module
only reads it: adding or retuning a pose never requires a code change.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Dict, List, Optional

from config import settings


def _mtime() -> float:
    """Not cached: the rubric is meant to be edited while the server runs."""
    return settings.asanas_path.stat().st_mtime


@lru_cache(maxsize=8)
def _load_cached(_stamp: float) -> Dict[str, Any]:
    with settings.asanas_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_rubric() -> Dict[str, Any]:
    """Returns the parsed rubric, reloading automatically when the file changes."""
    return _load_cached(_mtime())


REQUIRED_ANGLE_FIELDS = ("joint", "label", "unit", "ideal_min", "ideal_max")


def validate_rubric() -> List[str]:
    """Reports hand-editing mistakes instead of failing a request later."""
    issues: List[str] = []
    ids = set()

    for asana in load_rubric().get("asanas", []):
        asana_id = str(asana.get("id") or "")
        if not asana_id:
            issues.append("An asana entry has no id.")
            continue
        if asana_id in ids:
            issues.append(f"Duplicate asana id: {asana_id}.")
        ids.add(asana_id)

        joints = set()
        for angle in asana.get("angles", []):
            joint = str(angle.get("joint") or "?")
            missing = [
                field for field in REQUIRED_ANGLE_FIELDS if angle.get(field) in (None, "")
            ]
            if missing:
                issues.append(f"{asana_id}/{joint}: missing {', '.join(missing)}.")
            if not _is_number(angle.get("ideal_min")):
                issues.append(f"{asana_id}/{joint}: ideal_min is not a number.")
            if not _is_number(angle.get("ideal_max")):
                issues.append(f"{asana_id}/{joint}: ideal_max is not a number.")
            if (
                _is_number(angle.get("ideal_min"))
                and _is_number(angle.get("ideal_max"))
                and float(angle["ideal_min"]) > float(angle["ideal_max"])
            ):
                issues.append(f"{asana_id}/{joint}: ideal_min is greater than ideal_max.")
            if joint in joints:
                issues.append(f"{asana_id}/{joint}: duplicate joint id.")
            joints.add(joint)

    return issues[:25]


def rubric_meta() -> Dict[str, Any]:
    data = load_rubric()
    return {
        "schema_version": data.get("schema_version"),
        "status": data.get("status", "draft"),
        "units": data.get("units", "degrees"),
        "updated_at": data.get("updated_at"),
        "notes": data.get("notes", []),
        "asana_count": len(data.get("asanas", [])),
        "verified_angles": sum(
            1
            for asana in data.get("asanas", [])
            for angle in asana.get("angles", [])
            if angle.get("verified")
        ),
        "total_angles": sum(
            len(asana.get("angles", [])) for asana in data.get("asanas", [])
        ),
        "issues": validate_rubric(),
    }


def list_asanas() -> List[Dict[str, Any]]:
    """Compact list for the upload form's pose selector."""
    return [
        {
            "id": asana.get("id"),
            "name": asana.get("name"),
            "english_name": asana.get("english_name"),
            "level": asana.get("level"),
            "summary": asana.get("summary"),
            "camera_hint": asana.get("camera_hint"),
            "angle_count": len(asana.get("angles", [])),
            "verified": bool(asana.get("angles"))
            and all(angle.get("verified") for angle in asana.get("angles", [])),
        }
        for asana in load_rubric().get("asanas", [])
    ]


def get_asana(asana_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not asana_id:
        return None
    wanted = asana_id.strip().lower()
    for asana in load_rubric().get("asanas", []):
        if str(asana.get("id", "")).lower() == wanted:
            return asana
    return None


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def build_check(spec: Dict[str, Any], estimate: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Recomputes within-range state from the rubric.

    The model's own arithmetic is never trusted: if it claims a value is in range
    we recompute it here and record any disagreement.
    """
    value: Optional[float] = None
    confidence: Optional[str] = None

    if isinstance(estimate, dict):
        raw_value = estimate.get("estimate")
        if _is_number(raw_value):
            value = round(float(raw_value), 1)
        if estimate.get("confidence") in ("low", "medium", "high"):
            confidence = estimate["confidence"]

    raw_min = spec.get("ideal_min")
    raw_max = spec.get("ideal_max")
    ideal_min: Optional[float] = float(raw_min) if _is_number(raw_min) else None
    ideal_max: Optional[float] = float(raw_max) if _is_number(raw_max) else None

    within: Optional[bool] = None
    delta: Optional[float] = None
    disagreement = False

    if value is not None and ideal_min is not None and ideal_max is not None:
        within = ideal_min <= value <= ideal_max
        delta = 0.0 if within else round(
            ideal_min - value if value < ideal_min else value - ideal_max, 1
        )
        claimed = estimate.get("within_range") if isinstance(estimate, dict) else None
        if isinstance(claimed, bool) and claimed != within:
            disagreement = True

    return {
        "joint": spec.get("joint"),
        "label": spec.get("label"),
        "landmarks": spec.get("landmarks", []),
        "unit": spec.get("unit", "degrees"),
        "estimate": value,
        "ideal_min": ideal_min,
        "ideal_max": ideal_max,
        "tolerance": spec.get("tolerance"),
        "weight": float(spec.get("weight", 1.0)),
        "within_range": within,
        "delta": delta,
        "confidence": confidence,
        "verified": bool(spec.get("verified", False)),
        "reviewer_note": spec.get("reviewer_note"),
        "_model_disagreement": disagreement,
    }


def score_checks(checks: List[Dict[str, Any]]) -> Dict[str, Any]:
    usable = [check for check in checks if check["within_range"] is not None]
    if not usable:
        return {
            "score": None,
            "score_basis": "No rubric angle could be estimated from this photo.",
            "estimated_angles": 0,
            "total_angles": len(checks),
        }

    total_weight = sum(check["weight"] for check in usable) or 1.0
    ok_weight = sum(check["weight"] for check in usable if check["within_range"])
    in_range = sum(1 for check in usable if check["within_range"])

    return {
        "score": round(100 * ok_weight / total_weight),
        "score_basis": (
            f"{in_range} of {len(usable)} estimated angles inside the expert range "
            f"(weighted). {len(checks) - len(usable)} could not be estimated."
        ),
        "estimated_angles": len(usable),
        "total_angles": len(checks),
    }


def format_asana_for_prompt(asana: Dict[str, Any]) -> str:
    """Renders one rubric entry as prompt-ready text."""
    lines: List[str] = [
        f"Asana id: {asana.get('id')}",
        f"Name: {asana.get('name')} ({asana.get('english_name')})",
        f"Level: {asana.get('level', 'unknown')}",
        f"Camera hint: {asana.get('camera_hint', '-')}",
        f"Summary: {asana.get('summary', '-')}",
        "",
        "Rubric angles (ideal ranges are DRAFT placeholders from experts):",
    ]

    for angle in asana.get("angles", []):
        unit = angle.get("unit", "degrees")
        lines.append(
            f"- {angle.get('joint')}: {angle.get('label')} | ideal "
            f"{angle.get('ideal_min')}-{angle.get('ideal_max')} {unit} "
            f"| landmarks {', '.join(angle.get('landmarks', [])) or '-'} "
            f"| weight {angle.get('weight', 1.0)} "
            f"| verified {bool(angle.get('verified'))}"
        )

    def block(title: str, values: Optional[List[str]]) -> None:
        if values:
            lines.append("")
            lines.append(f"{title}:")
            lines.extend(f"- {value}" for value in values)

    block("Qualitative cues", asana.get("qualitative_cues"))
    block("Common mistakes", asana.get("common_mistakes"))
    block("Benefits", asana.get("benefits"))
    block("Precautions", asana.get("precautions"))

    return "\n".join(lines)
