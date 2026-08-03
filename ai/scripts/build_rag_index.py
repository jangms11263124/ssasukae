import json
import re
from pathlib import Path

import pymupdf


BASE_DIR = Path(__file__).resolve().parents[1]

RAG_DIR = BASE_DIR / "data" / "rag"
PDF_DIR = RAG_DIR / "pdfs"
SOURCES_PATH = RAG_DIR / "sources.json"

# 한 청크의 최대 글자 수와 앞 청크에서 중복할 글자 수
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


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
                        "topics": ",".join(source["topics"]),
                    },
                }
            )

    return records


def main() -> None:
    """PDF를 읽고 청킹한 결과를 확인합니다."""
    sources = load_sources()

    for source in sources:
        if not source.get("rag_allowed", False):
            continue

        pdf_path = PDF_DIR / source["file_name"]

        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF를 찾을 수 없습니다: {pdf_path}")

        pages = extract_pages(
            pdf_path,
            stop_at_references=source.get("stop_at_references", True),
        )
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
