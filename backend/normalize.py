"""Turns raw model output into a stable API response, recomputing all checks."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from rubric import build_check, score_checks

DISCLAIMER = (
    "Angles are estimates by a vision-language model from a single photograph. "
    "They are not measurements and should not be used for diagnosis. "
    "This prototype runs on a free model tier that may retain uploaded photos, so do not "
    "upload images of other people without consent."
)


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _text_list(value: Any, limit: int = 6) -> List[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()][:limit]


def _confidence(value: Any) -> str:
    return value if value in ("low", "medium", "high") else "medium"


def _normalize_corrections(
    value: Any, checks_by_joint: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Optional[str]]]:
    if not isinstance(value, list):
        return []

    corrections: List[Dict[str, Optional[str]]] = []
    for item in value[:6]:
        if not isinstance(item, dict):
            continue
        area = _text(item.get("area")) or "general"
        issue = _text(item.get("issue"))
        fix = _text(item.get("fix"))
        if not issue and not fix:
            continue

        joint = _text(item.get("joint")) or None
        check = checks_by_joint.get(joint) if joint else None
        angle_status: Optional[str] = None
        if check:
            if check["within_range"] is True:
                angle_status = "in_range"
            elif check["within_range"] is False:
                angle_status = "out_of_range"
            else:
                angle_status = "not_estimated"

        corrections.append(
            {
                "area": area,
                "issue": issue or None,
                "joint": joint,
                "fix": fix or None,
                "angle_status": angle_status,
            }
        )
    return corrections


def _resolve_asana(
    payload: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    requested_asana_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not candidates:
        return None

    if requested_asana_id and requested_asana_id != "auto":
        for candidate in candidates:
            if candidate.get("id") == requested_asana_id:
                return candidate

    claimed = payload.get("asana_id")
    if isinstance(claimed, str):
        for candidate in candidates:
            if str(candidate.get("id", "")).lower() == claimed.strip().lower():
                return candidate

    return None


def normalize_analysis(
    payload: Dict[str, Any],
    *,
    candidates: List[Dict[str, Any]],
    requested_asana_id: Optional[str],
    model: str,
) -> Dict[str, Any]:
    asana = _resolve_asana(payload, candidates, requested_asana_id)

    requested_explicit = bool(requested_asana_id and requested_asana_id != "auto")
    claimed_raw = payload.get("asana_id")
    claimed_id = claimed_raw.strip().lower() if isinstance(claimed_raw, str) else None
    pose_mismatch = bool(
        requested_explicit
        and asana is not None
        and claimed_id != str(asana.get("id", "")).lower()
    )

    checks: List[Dict[str, Any]] = []
    disagreements: List[str] = []

    if asana:
        estimates: Dict[str, Dict[str, Any]] = {}
        for item in payload.get("estimated_angles") or []:
            if isinstance(item, dict) and isinstance(item.get("joint"), str):
                estimates[item["joint"]] = item

        for spec in asana.get("angles", []):
            check = build_check(spec, estimates.get(spec.get("joint")))
            if check.pop("_model_disagreement", False):
                disagreements.append(str(check.get("label")))
            checks.append(check)

    score = score_checks(checks)

    checks_by_joint = {str(check["joint"]): check for check in checks}
    corrections = _normalize_corrections(payload.get("corrections"), checks_by_joint)

    caveats = _text_list(payload.get("caveats"))
    if pose_mismatch:
        hinted = f" It suggests {claimed_raw}." if claimed_id else ""
        caveats.insert(
            0,
            f"The photo does not look like the pose you selected, so these checks may not "
            f"apply.{hinted}",
        )
    for label in disagreements:
        caveats.append(
            f"The model's own in-range claim for {label} disagreed with the rubric; "
            "the rubric value was used instead."
        )

    unestimated = [str(check["label"]) for check in checks if check["estimate"] is None]
    if unestimated:
        preview = ", ".join(unestimated[:4])
        suffix = "..." if len(unestimated) > 4 else ""
        caveats.append(f"Could not estimate from this photo: {preview}{suffix}")

    if not asana:
        caveats.append(
            "This photo did not match any pose in the expert rubric, so no angle checks were run."
        )

    cue_joints = sorted(
        {
            str(correction["joint"])
            for correction in corrections
            if correction.get("angle_status") == "in_range" and correction.get("joint")
        }
    )
    if cue_joints:
        caveats.append(
            "The model raised corrections for "
            + ", ".join(cue_joints)
            + ", but those estimated angles are already inside the rubric range. "
            "Treat them as coaching cues, not measured faults; the rubric range and the cue disagree."
        )

    asana_block = None
    if asana:
        asana_block = {
            "id": asana.get("id"),
            "name": asana.get("name"),
            "english_name": asana.get("english_name"),
            "level": asana.get("level"),
            "camera_hint": asana.get("camera_hint"),
            "rubric_status": "draft",
            "verified": bool(asana.get("angles"))
            and all(angle.get("verified") for angle in asana.get("angles", [])),
        }

    return {
        "model": model,
        "requested_asana": requested_asana_id or "auto",
        "asana": asana_block,
        "pose_mismatch": pose_mismatch,
        "match_confidence": _confidence(payload.get("match_confidence")),
        "summary": _text(payload.get("summary")),
        "score": score["score"],
        "score_basis": score["score_basis"],
        "score_is_estimate": True,
        "estimated_angles": score["estimated_angles"],
        "total_rubric_angles": score["total_angles"],
        "angle_checks": checks,
        "corrections": corrections,
        "working_well": _text_list(payload.get("working_well")),
        "safety": _text_list(payload.get("safety")),
        "caveats": caveats,
        "disclaimer": DISCLAIMER,
    }
