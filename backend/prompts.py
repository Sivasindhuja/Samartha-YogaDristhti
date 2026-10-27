"""Prompt construction for the two model calls (pose review, follow-up chat)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from rubric import format_asana_for_prompt

ANALYZE_SYSTEM = """You are an experienced yoga teacher reviewing a single photograph of a student.

Hard rules:
- You ESTIMATE joint angles from the image. You never measure them. Never describe a value as measured, exact, or verified.
- The ideal ranges below are a DRAFT expert rubric. Use them as the comparison target. Never invent, widen, or "correct" a range.
- Only report an angle you can genuinely see. If a joint is hidden, cropped, blurry, or the camera angle makes it ambiguous, omit it and list it in caveats. Do not guess.
- Prefer qualitative observations (spinal shape, weight distribution, shoulder tension, gaze, props) for anything the numbers cannot express.
- A correction's `joint` must be a rubric joint that the correction is actually about. Never attach a joint id to a qualitative cue about the shoulders, neck, spine, gaze or weight. Use null for those.
- If the photo does not clearly show any of the provided asanas, return the closest id with low match_confidence, or null if nothing fits.
- Be concise, specific and actionable. No medical diagnosis. Never promise that a correction prevents injury.
- Reply with one JSON object and nothing else. No prose, no markdown fences."""

ANALYZE_RESPONSE_SHAPE = """{
  "asana_id": "one of the provided ids, or null",
  "match_confidence": "low | medium | high",
  "summary": "2-3 sentences on the overall alignment",
  "estimated_angles": [
    {
      "joint": "left_knee",
      "estimate": 176,
      "confidence": "low | medium | high",
      "within_range": true
    }
  ],
  "corrections": [
    {
      "area": "front knee",
      "issue": "what looks wrong, in plain language",
      "joint": "left_knee",
      "fix": "one concrete cue the student can act on"
    }
  ],
  "working_well": ["things that are correct"],
  "safety": ["contraindications or strain risks visible in the photo"],
  "caveats": ["what the photo or the estimate cannot tell you"]
}"""


def build_analyze_messages(
    *,
    candidates: List[Dict[str, Any]],
    requested_asana_id: Optional[str],
    data_url: str,
    profile: Dict[str, Any],
) -> List[Dict[str, Any]]:
    requested = requested_asana_id or "auto"
    rubric_text = "\n\n---\n\n".join(format_asana_for_prompt(asana) for asana in candidates)
    if not rubric_text:
        rubric_text = "No rubric entries are available. Give generic alignment feedback only."

    prompt = "\n".join(
        [
            f"Requested pose: {requested}"
            + (" (identify the pose yourself)" if requested == "auto" else ""),
            f"Student profile: age {profile.get('age', 'unknown')}, "
            f"self-reported flexibility {profile.get('flexibility', 'unknown')}, "
            f"goal {profile.get('goal', 'alignment')}.",
            f"Student note: {profile.get('notes') or 'none'}",
            "",
            "AVAILABLE RUBRIC(S):",
            rubric_text,
            "",
            "TASK:",
            "1. Pick the asana id that best matches this photo, or null if none match.",
            "2. For each rubric angle you can actually see, estimate its value in the rubric's unit.",
            "3. Mark per-angle confidence. Omit anything you cannot see; say so in caveats.",
            "4. Compare against the rubric ranges as given. Do not recompute or replace them.",
            "5. Put anything the numbers cannot express (spine, weight, gaze, props) in corrections or working_well.",
            "6. Set a correction's joint only when that rubric angle causes it. For qualitative cues "
            "(shoulders, neck, spine, gaze, weight, breath) set joint to null and describe the area instead.",
            "",
            "Reply with JSON only, exactly this shape:",
            ANALYZE_RESPONSE_SHAPE,
        ]
    )

    return [
        {"role": "system", "content": ANALYZE_SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]


CHAT_SYSTEM = """You are an experienced yoga teacher answering follow-up questions about one student's pose.

Rules:
- Ground every answer in the provided rubric and the previous review. Do not invent benefits or contraindications that the rubric does not support.
- If the rubric does not cover the question, say so and mark your answer as general guidance.
- This app reviews a single still photograph. It cannot count repetitions, measure hold time, or judge a flow. Say so plainly when asked, then give sensible general guidance.
- Angle values from the review are ESTIMATES from a vision model, not measurements. Never present them as precise.
- Be concise and actionable. No medical diagnosis.
- Answer in plain text, not JSON."""


def build_chat_messages(
    *,
    asana: Optional[Dict[str, Any]],
    analysis: Optional[Dict[str, Any]],
    question: str,
) -> List[Dict[str, Any]]:
    sections: List[str] = []

    if asana:
        sections.append(format_asana_for_prompt(asana))
    else:
        sections.append("Rubric: no matching pose entry available. Use general guidance.")

    if analysis:
        checks = analysis.get("angle_checks") or []
        angle_lines = [
            f"- {check.get('label')}: estimated {check.get('estimate')} {check.get('unit', '')} "
            f"(ideal {check.get('ideal_min')}-{check.get('ideal_max')}, "
            f"{'inside' if check.get('within_range') else 'outside'} range, "
            f"confidence {check.get('confidence') or 'unknown'})"
            for check in checks
            if check.get("estimate") is not None
        ]
        sections.append(
            "\n".join(
                [
                    "Previous review of this photo:",
                    f"- Asana: {(analysis.get('asana') or {}).get('name') or 'unknown'}",
                    f"- Estimated score: {analysis.get('score')} "
                    f"({analysis.get('score_basis') or 'n/a'})",
                    "- Estimated angles:",
                    *(angle_lines or ["- none could be estimated"]),
                ]
            )
        )
    else:
        sections.append("Previous review: none. The student has not uploaded a photo in this session.")

    sections.append(f"Student question: {question}")

    return [
        {"role": "system", "content": CHAT_SYSTEM},
        {"role": "user", "content": "\n\n".join(sections)},
    ]
