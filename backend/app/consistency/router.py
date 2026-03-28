"""
一致性检查API路由
"""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.exceptions import NotFoundException
from app.core.dependencies import NovelOwner
from app.core.consistency_checker import ConsistencyChecker
from app.foreshadowing.models import Foreshadowing, ForeshadowingStatus
from app.foreshadowing.schemas import (
    ForeshadowingCreate,
    ForeshadowingUpdate,
    ForeshadowingResolve,
    ForeshadowingResponse,
    ConsistencyCheckRequest,
    ConsistencyCheckResponse
)

router = APIRouter(prefix="/consistency", tags=["consistency"])
logger = logging.getLogger(__name__)


@router.post("/novels/{novel_id}/check")
async def check_consistency(
    novel: NovelOwner,
    request: ConsistencyCheckRequest,
    db: Session = Depends(get_db)
):
    """
    执行一致性检查
    
    - chapter_ids: 指定检查的章节ID列表（可选）
    - check_types: 检查类型列表 [character, plot, timeline, foreshadowing]
    """
    checker = ConsistencyChecker(db, novel.id)
    result = await checker.check_all(
        chapter_ids=request.chapter_ids,
        check_types=request.check_types
    )
    
    return ApiResponse.success(result)


@router.get("/novels/{novel_id}/foreshadowings")
def list_foreshadowings(
    novel: NovelOwner,
    status: str = None,
    foreshadowing_type: str = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取伏笔列表
    
    - status: 状态筛选 (unresolved/resolved/abandoned)
    - foreshadowing_type: 类型筛选 (plot/character/item/mystery/other)
    """
    query = db.query(Foreshadowing).filter(
        Foreshadowing.novel_id == novel.id
    )
    
    if status:
        query = query.filter(Foreshadowing.status == status)
    
    if foreshadowing_type:
        query = query.filter(Foreshadowing.foreshadowing_type == foreshadowing_type)
    
    total = query.count()
    items = query.order_by(Foreshadowing.importance.desc(), Foreshadowing.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return ApiResponse.paginated(
        [ForeshadowingResponse.model_validate(item) for item in items],
        total,
        page,
        page_size
    )


@router.post("/novels/{novel_id}/foreshadowings")
def create_foreshadowing(
    novel: NovelOwner,
    data: ForeshadowingCreate,
    db: Session = Depends(get_db)
):
    """
    创建伏笔（挖坑）
    
    - title: 伏笔标题
    - description: 伏笔描述
    - created_chapter_id: 挖坑章节ID
    - foreshadowing_type: 伏笔类型
    - importance: 重要程度 1-5
    """
    foreshadowing = Foreshadowing(
        novel_id=novel.id,
        title=data.title,
        description=data.description,
        created_chapter_id=data.created_chapter_id,
        foreshadowing_type=data.foreshadowing_type.value,
        importance=data.importance,
        metadata=data.metadata
    )
    
    db.add(foreshadowing)
    db.commit()
    db.refresh(foreshadowing)
    
    return ApiResponse.success({
        "id": foreshadowing.id,
        "title": foreshadowing.title,
        "status": foreshadowing.status,
        "message": "伏笔创建成功"
    })


@router.get("/novels/{novel_id}/foreshadowings/{foreshadowing_id}")
def get_foreshadowing(
    novel: NovelOwner,
    foreshadowing_id: int,
    db: Session = Depends(get_db)
):
    """
    获取伏笔详情
    """
    foreshadowing = db.query(Foreshadowing).filter(
        Foreshadowing.id == foreshadowing_id,
        Foreshadowing.novel_id == novel.id
    ).first()
    
    if not foreshadowing:
        raise NotFoundException("伏笔")
    
    return ApiResponse.success(ForeshadowingResponse.model_validate(foreshadowing))


@router.put("/novels/{novel_id}/foreshadowings/{foreshadowing_id}")
def update_foreshadowing(
    novel: NovelOwner,
    foreshadowing_id: int,
    data: ForeshadowingUpdate,
    db: Session = Depends(get_db)
):
    """
    更新伏笔信息
    """
    foreshadowing = db.query(Foreshadowing).filter(
        Foreshadowing.id == foreshadowing_id,
        Foreshadowing.novel_id == novel.id
    ).first()
    
    if not foreshadowing:
        raise NotFoundException("伏笔")
    
    if data.title is not None:
        foreshadowing.title = data.title
    if data.description is not None:
        foreshadowing.description = data.description
    if data.foreshadowing_type is not None:
        foreshadowing.foreshadowing_type = data.foreshadowing_type.value
    if data.importance is not None:
        foreshadowing.importance = data.importance
    if data.metadata is not None:
        foreshadowing.metadata = data.metadata
    
    db.commit()
    db.refresh(foreshadowing)
    
    return ApiResponse.success({
        "id": foreshadowing.id,
        "title": foreshadowing.title,
        "message": "伏笔更新成功"
    })


@router.post("/novels/{novel_id}/foreshadowings/{foreshadowing_id}/resolve")
def resolve_foreshadowing(
    novel: NovelOwner,
    foreshadowing_id: int,
    data: ForeshadowingResolve,
    db: Session = Depends(get_db)
):
    """
    解决伏笔（填坑）
    
    - resolved_chapter_id: 填坑章节ID
    - resolution_notes: 解决说明
    """
    foreshadowing = db.query(Foreshadowing).filter(
        Foreshadowing.id == foreshadowing_id,
        Foreshadowing.novel_id == novel.id
    ).first()
    
    if not foreshadowing:
        raise NotFoundException("伏笔")
    
    from datetime import datetime
    
    foreshadowing.status = ForeshadowingStatus.RESOLVED.value
    foreshadowing.resolved_chapter_id = data.resolved_chapter_id
    foreshadowing.resolution_notes = data.resolution_notes
    foreshadowing.resolved_at = datetime.now()
    
    db.commit()
    db.refresh(foreshadowing)
    
    return ApiResponse.success({
        "id": foreshadowing.id,
        "title": foreshadowing.title,
        "status": foreshadowing.status,
        "message": "伏笔已解决"
    })


@router.post("/novels/{novel_id}/foreshadowings/{foreshadowing_id}/abandon")
def abandon_foreshadowing(
    novel: NovelOwner,
    foreshadowing_id: int,
    reason: str = None,
    db: Session = Depends(get_db)
):
    """
    放弃伏笔
    
    - reason: 放弃原因
    """
    foreshadowing = db.query(Foreshadowing).filter(
        Foreshadowing.id == foreshadowing_id,
        Foreshadowing.novel_id == novel.id
    ).first()
    
    if not foreshadowing:
        raise NotFoundException("伏笔")
    
    foreshadowing.status = ForeshadowingStatus.ABANDONED.value
    if reason:
        foreshadowing.resolution_notes = f"放弃原因: {reason}"
    
    db.commit()
    
    return ApiResponse.success({
        "id": foreshadowing.id,
        "status": foreshadowing.status,
        "message": "伏笔已放弃"
    })


@router.get("/novels/{novel_id}/foreshadowings/unresolved")
def list_unresolved_foreshadowings(
    novel: NovelOwner,
    db: Session = Depends(get_db)
):
    """
    获取未解决的伏笔列表
    """
    foreshadowings = db.query(Foreshadowing).filter(
        Foreshadowing.novel_id == novel.id,
        Foreshadowing.status == ForeshadowingStatus.UNRESOLVED.value
    ).order_by(Foreshadowing.importance.desc()).all()
    
    return ApiResponse.success({
        "items": [ForeshadowingResponse.model_validate(fs) for fs in foreshadowings],
        "total": len(foreshadowings)
    })


@router.get("/novels/{novel_id}/foreshadowings/statistics")
def get_foreshadowing_statistics(
    novel: NovelOwner,
    db: Session = Depends(get_db)
):
    """
    获取伏笔统计信息
    """
    total = db.query(Foreshadowing).filter(
        Foreshadowing.novel_id == novel.id
    ).count()
    
    unresolved = db.query(Foreshadowing).filter(
        Foreshadowing.novel_id == novel.id,
        Foreshadowing.status == ForeshadowingStatus.UNRESOLVED.value
    ).count()
    
    resolved = db.query(Foreshadowing).filter(
        Foreshadowing.novel_id == novel.id,
        Foreshadowing.status == ForeshadowingStatus.RESOLVED.value
    ).count()
    
    abandoned = db.query(Foreshadowing).filter(
        Foreshadowing.novel_id == novel.id,
        Foreshadowing.status == ForeshadowingStatus.ABANDONED.value
    ).count()
    
    high_importance_unresolved = db.query(Foreshadowing).filter(
        Foreshadowing.novel_id == novel.id,
        Foreshadowing.status == ForeshadowingStatus.UNRESOLVED.value,
        Foreshadowing.importance >= 4
    ).count()
    
    return ApiResponse.success({
        "total": total,
        "unresolved": unresolved,
        "resolved": resolved,
        "abandoned": abandoned,
        "high_importance_unresolved": high_importance_unresolved,
        "resolution_rate": round(resolved / total * 100, 1) if total > 0 else 0
    })
