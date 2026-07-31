import re

from jamo import h2j
from rapidfuzz import fuzz


def normalize_text(text: str) -> str:
    # 공백, 문장부호, 특수문자 차이가 가사 점수에 과하게 영향을 주지 않도록 제거합니다.
    # 숫자, 영문, 한글만 남기고 영문은 소문자로 통일합니다.
    return re.sub(r"[^0-9A-Za-z\uAC00-\uD7A3]", "", text).lower()


def to_jamo_text(text: str) -> str:
    # 한글을 자모 단위로 분해하면 비슷하게 들리는 발음을 조금 더 자연스럽게 비교할 수 있습니다.
    return "".join(h2j(text))


def score_lyrics(lyrics: str, transcript: str) -> dict[str, int]:
    """정답 가사와 STT 결과를 비교해 최종 가사 점수만 반환합니다."""
    # 먼저 문자 비교용으로 두 문자열을 같은 기준으로 정규화합니다.
    lyrics_norm = normalize_text(lyrics)
    transcript_norm = normalize_text(transcript)

    # 문자 유사도는 정답 텍스트와 STT 텍스트가 얼마나 직접적으로 일치하는지 봅니다.
    text_similarity = fuzz.ratio(lyrics_norm, transcript_norm) if lyrics_norm else 0

    # 발음 유사도는 한글을 자모로 분해해서 비슷한 발음의 차이를 반영합니다.
    pronunciation_similarity = (
        fuzz.ratio(to_jamo_text(lyrics_norm), to_jamo_text(transcript_norm))
        if lyrics_norm
        else 0
    )

    # API 응답에는 내부 점수를 노출하지 않고, 두 유사도의 평균만 가사 점수로 반환합니다.
    lyrics_score = round(
        (text_similarity * 0.5)
        + (pronunciation_similarity * 0.5)
    )

    return {
        "lyricsScore": lyrics_score,
    }
