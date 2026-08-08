import json
import os

import psycopg
from dotenv import load_dotenv
from openai import OpenAI

from build_rag_index import (
    BASE_DIR,
    create_chunks,
    extract_document_pages,
    load_sources,
)


load_dotenv(BASE_DIR / ".env")

COLLECTION_NAME = os.getenv(
    "RAG_COLLECTION_NAME",
    "vocal_feedback_v1",
)
EMBEDDING_MODEL = os.getenv(
    "GMS_EMBEDDING_MODEL",
    "text-embedding-3-small",
)
EMBEDDING_DIMENSIONS = int(
    os.getenv("RAG_EMBEDDING_DIMENSIONS", "1536")
)
BATCH_SIZE = 32


INSERT_SQL = """
INSERT INTO rag_chunks (
    collection_name,
    chunk_id,
    document_id,
    content,
    metadata,
    embedding_model,
    embedding
)
VALUES (
    %s,
    %s,
    %s,
    %s,
    %s::jsonb,
    %s,
    %s::vector
)
"""


def create_embedding_client() -> OpenAI:
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


def load_all_chunks() -> list[dict]:
    """허용된 PDF와 TXT를 읽어 같은 기준의 청크를 생성합니다."""
    all_chunks = []

    for source in load_sources():
        if not source.get("rag_allowed", False):
            continue

        pages = extract_document_pages(source)
        chunks = create_chunks(source, pages)
        all_chunks.extend(chunks)

        print(
            f'{source["document_id"]}: '
            f'{len(pages)}페이지, {len(chunks)}청크 준비'
        )

    return all_chunks


def embed_texts(
    embedding_client: OpenAI,
    texts: list[str],
) -> list[list[float]]:
    """텍스트 묶음을 임베딩 벡터로 변환합니다."""
    response = embedding_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    ordered_data = sorted(response.data, key=lambda item: item.index)
    return [item.embedding for item in ordered_data]


def vector_literal(embedding: list[float]) -> str:
    """임베딩을 pgvector가 받는 문자열 형식으로 변환합니다."""
    if len(embedding) != EMBEDDING_DIMENSIONS:
        raise ValueError(
            "임베딩 차원이 일치하지 않습니다: "
            f"expected={EMBEDDING_DIMENSIONS}, "
            f"actual={len(embedding)}"
        )

    return "[" + ",".join(str(value) for value in embedding) + "]"


def prepare_rows(chunks: list[dict]) -> list[tuple]:
    """모든 청크를 임베딩하고 PostgreSQL 저장 행으로 만듭니다."""
    embedding_client = create_embedding_client()
    rows = []
    total = len(chunks)

    for start in range(0, total, BATCH_SIZE):
        batch = chunks[start : start + BATCH_SIZE]
        embeddings = embed_texts(
            embedding_client,
            [chunk["text"] for chunk in batch],
        )

        if len(embeddings) != len(batch):
            raise RuntimeError(
                "임베딩 응답 개수가 청크 개수와 일치하지 않습니다."
            )

        for chunk, embedding in zip(batch, embeddings):
            metadata = chunk["metadata"]
            rows.append(
                (
                    COLLECTION_NAME,
                    chunk["id"],
                    metadata["document_id"],
                    chunk["text"],
                    json.dumps(metadata, ensure_ascii=False),
                    EMBEDDING_MODEL,
                    vector_literal(embedding),
                )
            )

        completed = min(start + BATCH_SIZE, total)
        print(f"임베딩 완료: {completed}/{total}")

    return rows


def get_database_url() -> str:
    """pgvector 접속 주소를 환경변수에서 가져옵니다."""
    database_url = os.getenv("RAG_DATABASE_URL")
    if not database_url:
        raise RuntimeError("RAG_DATABASE_URL 환경변수가 필요합니다.")
    return database_url


def validate_database(database_url: str) -> None:
    """임베딩 전에 DB 접속과 대상 테이블 존재 여부를 확인합니다."""
    with psycopg.connect(
        database_url,
        connect_timeout=15,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT to_regclass('public.rag_chunks')"
            )
            if cursor.fetchone()[0] is None:
                raise RuntimeError(
                    "rag_chunks 테이블이 존재하지 않습니다."
                )


def replace_collection(
    database_url: str,
    rows: list[tuple],
) -> int:
    """대상 컬렉션을 트랜잭션 안에서 새 데이터로 교체합니다."""

    with psycopg.connect(
        database_url,
        connect_timeout=15,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT to_regclass('public.rag_chunks')"
            )
            if cursor.fetchone()[0] is None:
                raise RuntimeError(
                    "rag_chunks 테이블이 존재하지 않습니다."
                )

            cursor.execute(
                "DELETE FROM rag_chunks WHERE collection_name = %s",
                (COLLECTION_NAME,),
            )
            cursor.executemany(INSERT_SQL, rows)

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM rag_chunks
                WHERE collection_name = %s
                """,
                (COLLECTION_NAME,),
            )
            return cursor.fetchone()[0]


def main() -> None:
    """RAG 원문 전체를 새로 임베딩해 pgvector 컬렉션을 구성합니다."""
    chunks = load_all_chunks()
    if not chunks:
        raise RuntimeError("저장할 RAG 청크가 없습니다.")

    database_url = get_database_url()
    validate_database(database_url)
    print("pgvector 연결 및 rag_chunks 테이블 확인 완료")

    print(f"전체 청크 수: {len(chunks)}")
    rows = prepare_rows(chunks)
    saved_count = replace_collection(database_url, rows)

    if saved_count != len(rows):
        raise RuntimeError(
            "저장 전후 청크 수가 일치하지 않습니다: "
            f"expected={len(rows)}, actual={saved_count}"
        )

    print(f"pgvector 저장 완료: {saved_count}청크")


if __name__ == "__main__":
    main()
