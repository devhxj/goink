"""
Memory update retry mechanism.

When chapter memory (vector store) update fails after chapter content is saved,
the update is queued for retry to ensure eventual consistency between
the database and the vector store.
"""
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any

logger = logging.getLogger(__name__)

_pending_retries: Dict[str, Dict[str, Any]] = {}

MAX_RETRY_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 5


def schedule_memory_retry(novel_id: int, chapter_id: int) -> None:
    key = f"{novel_id}:{chapter_id}"
    _pending_retries[key] = {
        "novel_id": novel_id,
        "chapter_id": chapter_id,
        "attempts": 0,
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info(f"Scheduled memory retry for novel={novel_id}, chapter={chapter_id}")


async def execute_pending_retries() -> int:
    if not _pending_retries:
        return 0

    completed = 0
    failed_keys = []

    for key, info in list(_pending_retries.items()):
        novel_id = info["novel_id"]
        chapter_id = info["chapter_id"]
        info["attempts"] += 1

        try:
            from app.core.database import AsyncSessionLocal
            from app.core.vector_store import vector_store
            from app.chapters.models import Chapter
            from sqlalchemy import select

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Chapter).where(Chapter.id == chapter_id)
                )
                chapter = result.scalar_one_or_none()
                if not chapter or not chapter.content:
                    logger.warning(f"Chapter {chapter_id} not found or empty, skipping retry")
                    failed_keys.append(key)
                    continue

                vector_store.delete_chapter_chunks(novel_id, chapter.id)
                chunk_data = vector_store.build_chapter_chunks(
                    chapter_id=chapter.id,
                    chapter_number=chapter.chapter_number,
                    chapter_title=chapter.title,
                    content=chapter.content,
                    summary=chapter.summary,
                )
                if chunk_data:
                    vector_store.add_chunks(novel_id, chunk_data)

                logger.info(f"Memory retry succeeded for chapter {chapter_id}")
                completed += 1
                failed_keys.append(key)

        except Exception as exc:
            if info["attempts"] >= MAX_RETRY_ATTEMPTS:
                logger.error(
                    f"Memory retry exhausted for chapter {chapter_id} "
                    f"after {info['attempts']} attempts: {exc}"
                )
                failed_keys.append(key)
            else:
                logger.warning(
                    f"Memory retry attempt {info['attempts']} failed for chapter {chapter_id}: {exc}"
                )

    for key in failed_keys:
        _pending_retries.pop(key, None)

    return completed


def get_pending_retry_count() -> int:
    return len(_pending_retries)


def get_pending_retries_info() -> list[dict[str, Any]]:
    return [
        {
            "key": key,
            "novel_id": info["novel_id"],
            "chapter_id": info["chapter_id"],
            "attempts": info["attempts"],
            "scheduled_at": info["scheduled_at"],
        }
        for key, info in _pending_retries.items()
    ]
