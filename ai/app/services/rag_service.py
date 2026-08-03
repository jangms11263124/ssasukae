import os
from collections import Counter
from pathlib import Path

import chromadb
from dotenv import load_dotenv
from openai import OpenAI

from app.services.rag_queries import build_rag_query


BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")

RAG_DB_PATH = Path(
    os.getenv(
        "RAG_DB_PATH",
        str(BASE_DIR / "data" / "rag" / "chroma"),
    )
)

RAG_COLLECTION_NAME = os.getenv(
    "RAG_COLLECTION_NAME",
    "vocal_feedback_v1",
)

RAG_EMBEDDING_MODEL = os.getenv(
    "GMS_EMBEDDING_MODEL",
    "text-embedding-3-small",
)

# 우선 넓게 12개를 찾은 뒤 품질 조건으로 최대 6개만 선택합니다.
RAG_CANDIDATE_COUNT = 12
RAG_MAX_CONTEXTS = 6

# 코사인 거리는 낮을수록 관련성이 높습니다.
RAG_MAX_DISTANCE = 0.55

# 현재 소스가 한 권이므로 문제 유형별 절차가 누락되지 않게 합니다.
RAG_MAX_CONTEXTS_PER_DOCUMENT = 6


def _create_embedding_client() -> OpenAI:
    """GMS 임베딩 API 클라이언트를 생성합니다."""
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


def _embed_query(query: str) -> list[float]:
    """질문 검색 문장을 임베딩 벡터로 변환합니다."""
    client = _create_embedding_client()

    response = client.embeddings.create(
        model=RAG_EMBEDDING_MODEL,
        input=[query],
    )

    return response.data[0].embedding


def retrieve_rag_contexts(
    main_issues: list[dict],
) -> list[dict]:
    """오류 목록과 관련된 논문 청크를 ChromaDB에서 검색합니다."""
    query = build_rag_query(main_issues)

    # 현재 문서가 지원하지 않는 오류만 있다면 검색하지 않습니다.
    if not query:
        return []

    if not RAG_DB_PATH.exists():
        raise FileNotFoundError(
            f"RAG DB를 찾을 수 없습니다: {RAG_DB_PATH}"
        )

    chroma_client = chromadb.PersistentClient(
        path=str(RAG_DB_PATH)
    )

    collection = chroma_client.get_collection(
        name=RAG_COLLECTION_NAME,
        embedding_function=None,
    )

    if collection.count() == 0:
        return []

    query_embedding = _embed_query(query)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(
            RAG_CANDIDATE_COUNT,
            collection.count(),
        ),
        include=["documents", "metadatas", "distances"],
    )

    documents = results.get("documents")
    metadatas = results.get("metadatas")
    distances = results.get("distances")

    if not documents or not metadatas or not distances:
        return []

    selected_contexts = []
    document_counts = Counter()
    selected_pages = set()

    for chunk_id, document, metadata, distance in zip(
        results["ids"][0],
        documents[0],
        metadatas[0],
        distances[0],
    ):
        # 관련성이 낮은 검색 결과는 피드백 근거로 사용하지 않습니다.
        if distance > RAG_MAX_DISTANCE:
            continue

        document_id = metadata["document_id"]
        page_key = (document_id, metadata["page"])

        # 동일한 논문의 같은 페이지가 반복되는 것을 방지합니다.
        if page_key in selected_pages:
            continue

        # 하나의 논문이 모든 검색 결과를 차지하지 않도록 제한합니다.
        if (
            document_counts[document_id]
            >= RAG_MAX_CONTEXTS_PER_DOCUMENT
        ):
            continue

        selected_contexts.append(
            {
                "chunk_id": chunk_id,
                "text": document,
                "distance": round(float(distance), 4),
                "document_id": document_id,
                "title": metadata["title"],
                "authors": metadata["authors"],
                "year": metadata["year"],
                "page": metadata["page"],
                "source_url": metadata["source_url"],
                "license": metadata["license"],
            }
        )

        selected_pages.add(page_key)
        document_counts[document_id] += 1

        if len(selected_contexts) >= RAG_MAX_CONTEXTS:
            break

    return selected_contexts
