import os

import chromadb
from dotenv import load_dotenv
from openai import OpenAI

from build_rag_index import (
    BASE_DIR,
    PDF_DIR,
    RAG_DIR,
    create_chunks,
    extract_pages,
    load_sources,
)


CHROMA_DIR = RAG_DIR / "chroma"
COLLECTION_NAME = "vocal_feedback_v1"
BATCH_SIZE = 32

load_dotenv(BASE_DIR / ".env")


def create_embedding_client() -> OpenAI:
    """GMS 임베딩 API를 호출할 클라이언트를 생성합니다."""
    gms_key = os.getenv("GMS_KEY")

    if not gms_key:
        raise RuntimeError("GMS_KEY 환경변수가 필요합니다.")

    return OpenAI(
        api_key=gms_key,
        base_url=os.getenv(
            "GMS_BASE_URL",
            "https://gms.ssafy.io/gmsapi/api.openai.com/v1",
        ),
        timeout=60,
    )


def load_all_chunks() -> list[dict]:
    """모든 PDF를 읽고 검색 단위인 청크 목록을 만듭니다."""
    all_chunks = []

    for source in load_sources():
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

        all_chunks.extend(chunks)

        print(
            f'{source["document_id"]}: '
            f'{len(chunks)}개 청크 준비'
        )

    return all_chunks


def embed_texts(
    embedding_client: OpenAI,
    texts: list[str],
) -> list[list[float]]:
    """텍스트 묶음을 GMS에 보내 임베딩 벡터로 변환합니다."""
    model = os.getenv(
        "GMS_EMBEDDING_MODEL",
        "text-embedding-3-small",
    )

    response = embedding_client.embeddings.create(
        model=model,
        input=texts,
    )

    # 응답 순서를 입력 텍스트 순서와 동일하게 정렬합니다.
    ordered_data = sorted(response.data, key=lambda item: item.index)
    return [item.embedding for item in ordered_data]


def save_chunks(chunks: list[dict]) -> None:
    """청크, 임베딩, 출처 정보를 로컬 ChromaDB에 저장합니다."""
    embedding_client = create_embedding_client()

    chroma_client = chromadb.PersistentClient(
        path=str(CHROMA_DIR)
    )

    # 이전 인덱스에 남아 있는 청크를 제거합니다.
    # PDF 원본은 삭제하지 않고 Chroma 컬렉션만 다시 만듭니다.
    existing_collection_names = {
        collection.name
        for collection in chroma_client.list_collections()
    }

    if COLLECTION_NAME in existing_collection_names:
        chroma_client.delete_collection(
            name=COLLECTION_NAME
        )
        print(f"기존 컬렉션 삭제: {COLLECTION_NAME}")

    collection = chroma_client.get_or_create_collection(
        name=COLLECTION_NAME,
        configuration={
            "hnsw": {
                "space": "cosine",
            }
        },
        embedding_function=None,
    )

    total = len(chunks)

    # 전체 청크를 한 번에 보내지 않고 32개씩 나눠 처리합니다.
    for start in range(0, total, BATCH_SIZE):
        batch = chunks[start : start + BATCH_SIZE]
        texts = [chunk["text"] for chunk in batch]

        embeddings = embed_texts(
            embedding_client=embedding_client,
            texts=texts,
        )

        collection.upsert(
            ids=[chunk["id"] for chunk in batch],
            documents=texts,
            metadatas=[chunk["metadata"] for chunk in batch],
            embeddings=embeddings,
        )

        completed = min(start + BATCH_SIZE, total)
        print(f"임베딩 및 저장: {completed}/{total}")

    print(f"ChromaDB 저장 위치: {CHROMA_DIR}")
    print(f"최종 저장 청크 수: {collection.count()}")


def main() -> None:
    """전체 PDF를 청킹하고 ChromaDB 인덱스를 생성합니다."""
    chunks = load_all_chunks()

    print(f"전체 청크 수: {len(chunks)}")
    save_chunks(chunks)


if __name__ == "__main__":
    main()
