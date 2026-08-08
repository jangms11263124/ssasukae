import sys

import psycopg

from index_rag_documents_pgvector import (
    COLLECTION_NAME,
    create_embedding_client,
    embed_texts,
    get_database_url,
    vector_literal,
)


SEARCH_SQL = """
WITH query_vector AS (
    SELECT %s::vector AS embedding
)
SELECT
    chunk.chunk_id,
    chunk.content,
    chunk.metadata,
    chunk.embedding <=> query_vector.embedding AS distance
FROM rag_chunks AS chunk
CROSS JOIN query_vector
WHERE chunk.collection_name = %s
ORDER BY distance
LIMIT %s
"""


def search_documents(
    query: str,
    result_count: int = 5,
) -> None:
    """질문과 의미가 가까운 청크를 pgvector에서 검색합니다."""
    embedding_client = create_embedding_client()
    query_embedding = embed_texts(
        embedding_client,
        [query],
    )[0]
    query_vector = vector_literal(query_embedding)

    with psycopg.connect(
        get_database_url(),
        connect_timeout=15,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                SEARCH_SQL,
                (
                    query_vector,
                    COLLECTION_NAME,
                    result_count,
                ),
            )
            results = cursor.fetchall()

    print(f"\n검색 질문: {query}")
    print(f"검색 결과: {len(results)}개\n")

    for index, row in enumerate(results, start=1):
        chunk_id, content, metadata, distance = row

        print(f"[검색 결과 {index}]")
        print(f"거리: {float(distance):.4f}")
        print(f"문서: {metadata['title']}")
        print(f"페이지: {metadata['page']}")
        print(f"청크 ID: {chunk_id}")
        print(f"내용: {content[:500]}")
        print("-" * 80)


def main() -> None:
    """명령줄에서 받은 검색어로 pgvector를 테스트합니다."""
    query = " ".join(sys.argv[1:]).strip()

    if not query:
        query = (
            "How can a singer improve pitch accuracy "
            "using visual and auditory feedback?"
        )

    search_documents(query)


if __name__ == "__main__":
    main()
