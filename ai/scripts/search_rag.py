import sys

import chromadb

from index_rag_documents import (
    CHROMA_DIR,
    COLLECTION_NAME,
    create_embedding_client,
    embed_texts,
)


def search_documents(
    query: str,
    result_count: int = 5,
) -> None:
    """질문과 의미가 가까운 논문 청크를 ChromaDB에서 검색합니다."""
    embedding_client = create_embedding_client()

    # 검색 질문도 PDF와 동일한 모델로 임베딩합니다.
    query_embedding = embed_texts(
        embedding_client=embedding_client,
        texts=[query],
    )[0]

    chroma_client = chromadb.PersistentClient(
        path=str(CHROMA_DIR)
    )

    collection = chroma_client.get_collection(
        name=COLLECTION_NAME,
        embedding_function=None,
    )

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=result_count,
        include=["documents", "metadatas", "distances"],
    )

    print(f"\n검색 질문: {query}")
    print(f"전체 저장 청크: {collection.count()}\n")

    for index in range(len(results["ids"][0])):
        chunk_id = results["ids"][0][index]
        document = results["documents"][0][index]
        metadata = results["metadatas"][0][index]
        distance = results["distances"][0][index]

        print(f"[검색 결과 {index + 1}]")
        print(f"거리: {distance:.4f}")
        print(f"문서: {metadata['title']}")
        print(f"페이지: {metadata['page']}")
        print(f"청크 ID: {chunk_id}")
        print(f"내용: {document[:500]}")
        print("-" * 80)


def main() -> None:
    """명령줄에서 받은 검색어로 논문을 검색합니다."""
    query = " ".join(sys.argv[1:]).strip()

    if not query:
        query = (
            "How can a singer improve pitch accuracy "
            "using visual and auditory feedback?"
        )

    search_documents(query)


if __name__ == "__main__":
    main()