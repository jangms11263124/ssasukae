import json
import re
from pathlib import Path

import pymupdf


BASE_DIR = Path(__file__).resolve().parents[1]

RAG_DIR = BASE_DIR / "data" / "rag"
PDF_DIR = RAG_DIR / "pdfs"
TEXT_DIR = RAG_DIR / "texts"
SOURCES_PATH = RAG_DIR / "sources.json"

# 한 청크의 최대 글자 수와 앞 청크에서 중복할 글자 수
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150
TEXT_PAGE_SIZE = 12000


def load_sources() -> list[dict]:
    """sources.json에서 문서와 라이선스 정보를 읽습니다."""
    with SOURCES_PATH.open(encoding="utf-8") as file:
        return json.load(file)


def normalize_text(text: str) -> str:
    """PDF에서 추출한 불필요한 줄바꿈과 공백을 정리합니다."""
    text = text.replace("\u00ad", "")
    text = re.sub(r"-\s*\n\s*", "", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def strip_gutenberg_boilerplate(text: str) -> str:
    """Project Gutenberg의 배포 안내문을 본문에서 제외합니다."""
    start_match = re.search(
        r"\*\*\*\s*START OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if start_match:
        text = text[start_match.end() :]

    end_match = re.search(
        r"\*\*\*\s*END OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if end_match:
        text = text[: end_match.start()]

    return text


def normalize_plain_text(text: str) -> str:
    """TXT의 줄바꿈은 정리하되 문단 경계는 보존합니다."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00ad", "")
    text = re.sub(r"(?<=\w)-\n(?=\w)", "", text)

    paragraphs = []
    for paragraph in re.split(r"\n\s*\n+", text):
        paragraph = re.sub(r"[ \t]*\n[ \t]*", " ", paragraph)
        paragraph = re.sub(r"[ \t]+", " ", paragraph).strip()
        if paragraph:
            paragraphs.append(paragraph)

    return "\n\n".join(paragraphs)


def split_text_pages(text: str) -> list[str]:
    """페이지가 없는 TXT를 문단 경계 기준의 가상 페이지로 나눕니다."""
    pages = []
    current_paragraphs = []
    current_length = 0

    for paragraph in text.split("\n\n"):
        additional_length = len(paragraph)
        if current_paragraphs:
            additional_length += 2

        if (
            current_paragraphs
            and current_length + additional_length > TEXT_PAGE_SIZE
        ):
            pages.append("\n\n".join(current_paragraphs))
            current_paragraphs = []
            current_length = 0

        current_paragraphs.append(paragraph)
        current_length += additional_length

    if current_paragraphs:
        pages.append("\n\n".join(current_paragraphs))

    return pages


def extract_text_pages(
    text_path: Path,
    *,
    remove_gutenberg_boilerplate: bool = False,
) -> list[dict]:
    """UTF-8 TXT 본문을 정제해 가상 페이지 단위로 반환합니다."""
    text = text_path.read_text(encoding="utf-8-sig")
    if remove_gutenberg_boilerplate:
        text = strip_gutenberg_boilerplate(text)

    text = normalize_plain_text(text)
    if not text:
        return []

    return [
        {
            "page": page_number,
            "text": page_text,
        }
        for page_number, page_text in enumerate(
            split_text_pages(text),
            start=1,
        )
    ]


def resolve_source_path(source: dict) -> Path:
    """파일 확장자에 맞는 RAG 원문 경로를 반환합니다."""
    file_name = source["file_name"]
    suffix = Path(file_name).suffix.lower()

    if suffix == ".pdf":
        return PDF_DIR / file_name
    if suffix == ".txt":
        return TEXT_DIR / file_name

    raise ValueError(f"지원하지 않는 RAG 문서 형식입니다: {suffix}")


def extract_document_pages(source: dict) -> list[dict]:
    """PDF 또는 TXT 원문을 공통 페이지 구조로 읽습니다."""
    source_path = resolve_source_path(source)
    if not source_path.exists():
        raise FileNotFoundError(f"RAG 원문을 찾을 수 없습니다: {source_path}")

    if source_path.suffix.lower() == ".pdf":
        return extract_pages(
            source_path,
            stop_at_references=source.get("stop_at_references", True),
        )

    return extract_text_pages(
        source_path,
        remove_gutenberg_boilerplate=source.get(
            "strip_gutenberg_boilerplate",
            False,
        ),
    )


def extract_pages(
    pdf_path: Path,
    *,
    stop_at_references: bool = True,
) -> list[dict]:
    """PDF 본문을 페이지별로 추출합니다.

    단일 논문은 참고문헌 이후를 제외하지만, 장별 참고문헌이 있는 교재는
    ``stop_at_references=False``로 설정해 문서 전체를 수집할 수 있습니다.
    """
    extracted_pages = []
    reached_references = False

    with pymupdf.open(pdf_path) as document:
        for page_number, page in enumerate(document, start=1):
            blocks = page.get_text("blocks", sort=True)
            block_texts = []

            for block in blocks:
                block_text = normalize_text(block[4])

                if not block_text:
                    continue

                # References 또는 Bibliography 제목을 만나면
                # 이후 내용은 RAG 데이터에 포함하지 않습니다.
                if stop_at_references and re.fullmatch(
                    r"(?:\d+\.\s*)?(references|bibliography)",
                    block_text,
                    flags=re.IGNORECASE,
                ):
                    reached_references = True
                    break

                block_texts.append(block_text)

            # References 제목 전에 본문이 있었다면 그 내용은 보존합니다.
            if block_texts:
                extracted_pages.append(
                    {
                        "page": page_number,
                        "text": "\n\n".join(block_texts),
                    }
                )

            if reached_references:
                break

    return extracted_pages


def split_text(text: str) -> list[str]:
    """긴 페이지 텍스트를 일정 크기의 청크로 나눕니다."""
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))

        # 가능하면 문단 또는 문장이 끝나는 위치에서 자릅니다.
        if end < len(text):
            search_start = start + (CHUNK_SIZE // 2)

            paragraph_end = text.rfind("\n\n", search_start, end)
            sentence_end = text.rfind(". ", search_start, end)

            if paragraph_end != -1:
                end = paragraph_end
            elif sentence_end != -1:
                end = sentence_end + 1

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break

        # 문맥이 끊기지 않도록 앞 청크의 마지막 150자를 중복합니다.
        start = max(end - CHUNK_OVERLAP, start + 1)

    return chunks


def create_chunks(source: dict, pages: list[dict]) -> list[dict]:
    """페이지 텍스트를 ChromaDB에 저장할 청크 구조로 변환합니다."""
    records = []

    for page in pages:
        page_chunks = split_text(page["text"])

        for chunk_number, chunk_text in enumerate(page_chunks, start=1):
            records.append(
                {
                    "id": (
                        f'{source["document_id"]}'
                        f'-p{page["page"]:03d}'
                        f'-c{chunk_number:03d}'
                    ),
                    "text": chunk_text,
                    "metadata": {
                        "document_id": source["document_id"],
                        "title": source["title"],
                        "authors": source["authors"],
                        "year": source["year"],
                        "page": page["page"],
                        "source_url": source["source_url"],
                        "license": source["license"],
                        "source_format": (
                            Path(source["file_name"])
                            .suffix.lower()
                            .lstrip(".")
                        ),
                        "topics": ",".join(source["topics"]),
                    },
                }
            )

    return records


def main() -> None:
    """PDF와 TXT를 읽고 청킹한 결과를 확인합니다."""
    sources = load_sources()

    for source in sources:
        if not source.get("rag_allowed", False):
            continue

        pages = extract_document_pages(source)
        chunks = create_chunks(source, pages)

        print(
            f'{source["document_id"]}: '
            f'{len(pages)}페이지 → {len(chunks)}청크'
        )

        if chunks:
            preview = chunks[0]["text"][:160].replace("\n", " ")
            print(f'  첫 청크 ID: {chunks[0]["id"]}')
            print(f"  미리보기: {preview}...")


if __name__ == "__main__":
    main()
