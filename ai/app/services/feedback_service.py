import json
import os
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

from app.schemas.feedback import FeedbackRequest, FeedbackResponse, NoteEvent
from app.services.feedback_analysis import (
    analyze_issues,
    midi_to_note_name,
    summarize_issues,
)
from app.services.score_service import parse_midi_notes


load_dotenv()

GMS_BASE_URL = os.getenv(
    "GMS_BASE_URL",
    "https://gms.ssafy.io/gmsapi/api.openai.com/v1",
)
GMS_MODEL = os.getenv("GMS_MODEL", "gpt-4.1-nano")
MAX_NOTES_FOR_PROMPT = 120


def build_feedback_request(
    score_details: dict[str, int],
    reference_payload: Any,
    singer_payload: Any,
) -> FeedbackRequest:
    """채점 결과와 두 MIDI JSON을 AI 피드백 입력 모델로 변환합니다.

    밀리초 단위 시간은 초 단위로, MIDI 숫자는 음 이름으로 변환하여 정답과 사용자 음표를
    ``FeedbackRequest``에 담습니다.
    """
    reference_notes = parse_midi_notes(reference_payload, "referenceMidi")
    user_notes = parse_midi_notes(singer_payload, "singerMidi")

    return FeedbackRequest(
        overall_score=score_details["finalScore"],
        pitch_score=score_details["pitchScore"],
        rhythm_score=score_details["rhythmScore"],
        stability_score=score_details["stabilityScore"],
        reference_notes=[
            NoteEvent(
                start=note["start_ms"] / 1000,
                duration=(note["end_ms"] - note["start_ms"]) / 1000,
                note=midi_to_note_name(note["midi"]),
            )
            for note in reference_notes
        ],
        user_notes=[
            NoteEvent(
                start=note["start_ms"] / 1000,
                duration=(note["end_ms"] - note["start_ms"]) / 1000,
                note=midi_to_note_name(note["midi"]),
            )
            for note in user_notes
        ],
    )


def _note_to_dict(note: NoteEvent) -> dict:
    """Pydantic 음표 모델을 프롬프트에 넣을 수 있는 일반 사전으로 변환합니다."""
    return {
        "start": note.start,
        "duration": note.duration,
        "note": note.note,
    }


def _sample_notes(
    notes: list[NoteEvent],
    limit: int = MAX_NOTES_FOR_PROMPT,
) -> list[dict]:
    """프롬프트 크기를 제한하기 위해 긴 음표 목록의 앞·중간·끝을 균등 샘플링합니다.

    목록이 제한보다 짧으면 모든 음표를 사전 형태로 변환해 반환합니다.
    """
    if len(notes) <= limit:
        return [_note_to_dict(note) for note in notes]

    head_count = limit // 3
    middle_count = limit // 3
    tail_count = limit - head_count - middle_count
    middle_start = max(0, (len(notes) // 2) - (middle_count // 2))
    sampled = [
        *notes[:head_count],
        *notes[middle_start : middle_start + middle_count],
        *notes[-tail_count:],
    ]
    return [_note_to_dict(note) for note in sampled]


def _build_feedback_payload(request: FeedbackRequest) -> dict:
    """점수, 주요 오류, 오류 요약과 음표 샘플을 하나의 프롬프트 자료로 구성합니다."""
    main_issues = analyze_issues(request.reference_notes, request.user_notes)
    return {
        "scores": {
            "overall_score": request.overall_score,
            "pitch_score": request.pitch_score,
            "rhythm_score": request.rhythm_score,
            "stability_score": request.stability_score,
        },
        "main_issues": main_issues,
        "issue_summary": summarize_issues(main_issues),
        "reference_notes_count": len(request.reference_notes),
        "user_notes_count": len(request.user_notes),
        "reference_notes_sample": _sample_notes(request.reference_notes),
        "user_notes_sample": _sample_notes(request.user_notes),
    }


def _build_user_prompt(request: FeedbackRequest) -> str:
    """피드백 자료와 JSON 반환 규칙을 결합해 모델에 전달할 사용자 프롬프트를 만듭니다."""
    payload = _build_feedback_payload(request)
    return (
        "아래는 사용자의 보컬 채점 결과, 정답 악보와 가창 악보의 차이 분석입니다.\n"
        "main_issues는 서버가 정답 악보와 가창 악보를 비교해서 만든 핵심 오류 목록입니다.\n"
        "issue_summary는 오류 종류와 심각도 요약입니다.\n"
        "reference_notes_sample과 user_notes_sample은 참고용 샘플입니다.\n"
        "피드백은 main_issues, issue_summary, 점수를 우선 근거로 삼아 작성하세요.\n"
        "반드시 JSON만 반환하세요. 마크다운 코드블록은 쓰지 마세요.\n\n"
        "반환 형식:\n"
        "{\n"
        '  "summary": "전체 피드백 요약",\n'
        '  "strengths": "잘한 점 1",\n'
        '  "improvements": "개선점 1",\n'
        '  "practice_tips": "연습 방법 1"\n'
        "}\n\n"
        f"입력 데이터:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )


def _parse_feedback_json(content: str) -> FeedbackResponse:
    """모델 응답에서 JSON 객체를 찾아 검증된 피드백 응답 모델로 변환합니다.

    선택적으로 포함된 마크다운 코드 블록을 제거하며 JSON 객체가 없거나 응답 필드가
    올바르지 않으면 예외를 발생시킵니다.
    """
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("GMS response did not contain a JSON object.")

    return FeedbackResponse(**json.loads(text[start : end + 1]))


def create_feedback(request: FeedbackRequest) -> FeedbackResponse:
    """GMS의 OpenAI 호환 채팅 API를 호출해 한국어 보컬 피드백을 생성합니다.

    모델에는 서버가 계산한 점수·오류·음표 자료만 사용하도록 지시하며, 받은 텍스트를
    ``FeedbackResponse`` 형식으로 검증해 반환합니다.
    """
    gms_key = os.getenv("GMS_KEY")
    if not gms_key:
        raise RuntimeError("GMS_KEY environment variable is required.")

    client = OpenAI(
        api_key=gms_key,
        base_url=GMS_BASE_URL,
        timeout=60,
    )
    response = client.chat.completions.create(
        model=GMS_MODEL,
        messages=[
            {
                "role": "developer",
                "content": (
                    "Answer in Korean. "
                    "You are a kind and practical vocal coach. "
                    "Use only the provided scores, main issues, issue summary, and note data. "
                    "Do not guess lyrics, sections, or vocal technique that is not in the data."
                ),
            },
            {
                "role": "user",
                "content": _build_user_prompt(request),
            },
        ],
    )

    content = response.choices[0].message.content
    if not content:
        raise ValueError("GMS response content is empty.")
    return _parse_feedback_json(content)
