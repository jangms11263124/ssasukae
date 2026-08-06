import os
from collections import Counter

import psycopg
from dotenv import load_dotenv
from openai import OpenAI

from app.services.rag_queries import build_rag_query


load_dotenv()

RAG_DATABASE_URL = os.getenv("RAG_DATABASE_URL")
RAG_COLLECTION_NAME = os.getenv(
    "RAG_COLLECTION_NAME",
    "vocal_feedback_v1",
)
RAG_EMBEDDING_MODEL = os.getenv(
    "GMS_EMBEDDING_MODEL",
    "text-embedding-3-small",
)
RAG_EMBEDDING_DIMENSIONS = int(
    os.getenv("RAG_EMBEDDING_DIMENSIONS", "1536")
)

# 관련도 순으로 12개를 조회한 뒤 조건을 적용해 최대 6개만 선택합니다.
RAG_CANDIDATE_COUNT = 12
RAG_MAX_CONTEXTS = 6

# 코사인 거리가 작을수록 질문과 청크의 의미가 가깝습니다.
RAG_MAX_DISTANCE = 0.55

# 하나의 문서가 모든 검색 결과를 차지하지 않도록 제한합니다.
RAG_MAX_CONTEXTS_PER_DOCUMENT = 6


SEARCH_SQL = """
WITH query_vector AS (
    SELECT %s::vector AS embedding
)
SELECT
    chunk.chunk_id,
    chunk.document_id,
    chunk.content,
    chunk.metadata,
    chunk.embedding <=> query_vector.embedding AS distance
FROM rag_chunks AS chunk
CROSS JOIN query_vector
WHERE chunk.collection_name = %s
ORDER BY distance
LIMIT %s
"""


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
    """검색 문장을 임베딩 벡터로 변환합니다."""
    client = _create_embedding_client()
    response = client.embeddings.create(
        model=RAG_EMBEDDING_MODEL,
        input=[query],
    )
    embedding = response.data[0].embedding

    if len(embedding) != RAG_EMBEDDING_DIMENSIONS:
        raise ValueError(
            "검색 임베딩 차원이 일치하지 않습니다: "
            f"expected={RAG_EMBEDDING_DIMENSIONS}, "
            f"actual={len(embedding)}"
        )

    return embedding


def _vector_literal(embedding: list[float]) -> str:
    """임베딩을 pgvector가 받는 문자열 형식으로 변환합니다."""
    return "[" + ",".join(str(value) for value in embedding) + "]"


def _search_chunks(query_embedding: list[float]) -> list[tuple]:
    """pgvector에서 질문과 의미가 가까운 청크를 조회합니다."""
    if not RAG_DATABASE_URL:
        raise RuntimeError("RAG_DATABASE_URL 환경변수가 필요합니다.")

    query_vector = _vector_literal(query_embedding)

    with psycopg.connect(
        RAG_DATABASE_URL,
        connect_timeout=15,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                SEARCH_SQL,
                (
                    query_vector,
                    RAG_COLLECTION_NAME,
                    RAG_CANDIDATE_COUNT,
                ),
            )
            return cursor.fetchall()


def retrieve_rag_contexts(
    main_issues: list[dict],
) -> list[dict]:
    """오류 목록과 관련된 문서 청크를 pgvector에서 검색합니다."""
    query = build_rag_query(main_issues)

    # 현재 문서가 지원하지 않는 오류만 있다면 검색하지 않습니다.
    if not query:
        return []

    if not RAG_DATABASE_URL:
        raise RuntimeError("RAG_DATABASE_URL 환경변수가 필요합니다.")

    query_embedding = _embed_query(query)
    rows = _search_chunks(query_embedding)

    selected_contexts = []
    document_counts = Counter()
    selected_pages = set()

    for chunk_id, document_id, content, metadata, distance in rows:
        distance = float(distance)

        # 관련성이 낮은 검색 결과는 피드백 근거로 사용하지 않습니다.
        if distance > RAG_MAX_DISTANCE:
            continue

        page_key = (document_id, metadata["page"])

        # 같은 문서의 같은 페이지가 반복되는 것을 방지합니다.
        if page_key in selected_pages:
            continue

        # 하나의 문서가 모든 검색 결과를 차지하지 않도록 제한합니다.
        if (
            document_counts[document_id]
            >= RAG_MAX_CONTEXTS_PER_DOCUMENT
        ):
            continue

        selected_contexts.append(
            {
                "chunk_id": chunk_id,
                "text": content,
                "distance": round(distance, 4),
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
