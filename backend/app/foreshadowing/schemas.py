"""
伏笔管理模块 - Pydantic验证模型
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class ForeshadowingType(str, Enum):
    PLOT = "plot"
    CHARACTER = "character"
    ITEM = "item"
    MYSTERY = "mystery"
    OTHER = "other"


class ForeshadowingStatus(str, Enum):
    UNRESOLVED = "unresolved"
    RESOLVED = "resolved"
    ABANDONED = "abandoned"


class ForeshadowingCreate(BaseModel):
    """创建伏笔请求"""
    title: str = Field(..., min_length=1, max_length=255, description="伏笔标题")
    description: Optional[str] = Field(None, description="伏笔描述")
    created_chapter_id: Optional[int] = Field(None, description="挖坑章节ID")
    foreshadowing_type: ForeshadowingType = Field(default=ForeshadowingType.OTHER, description="伏笔类型")
    importance: int = Field(default=1, ge=1, le=5, description="重要程度1-5")
    metadata: Optional[Dict[str, Any]] = Field(None, description="额外元数据")


class ForeshadowingUpdate(BaseModel):
    """更新伏笔请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    foreshadowing_type: Optional[ForeshadowingType] = None
    importance: Optional[int] = Field(None, ge=1, le=5)
    metadata: Optional[Dict[str, Any]] = None


class ForeshadowingResolve(BaseModel):
    """解决伏笔请求"""
    resolved_chapter_id: int = Field(..., description="填坑章节ID")
    resolution_notes: Optional[str] = Field(None, description="解决说明")


class ForeshadowingResponse(BaseModel):
    """伏笔响应"""
    id: int
    novel_id: int
    created_chapter_id: Optional[int]
    resolved_chapter_id: Optional[int]
    title: str
    description: Optional[str]
    foreshadowing_type: str
    status: str
    importance: int
    resolution_notes: Optional[str]
    metadata: Optional[Dict[str, Any]]
    created_at: datetime
    resolved_at: Optional[datetime]
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class ForeshadowingListResponse(BaseModel):
    """伏笔列表响应"""
    items: List[ForeshadowingResponse]
    total: int
    page: int
    page_size: int


class ConsistencyIssue(BaseModel):
    """一致性问题"""
    issue_type: str = Field(..., description="问题类型: character/plot/timeline/foreshadowing")
    severity: str = Field(..., description="严重程度: error/warning/info")
    chapter_id: Optional[int] = Field(None, description="相关章节ID")
    chapter_number: Optional[int] = Field(None, description="章节号")
    description: str = Field(..., description="问题描述")
    details: Optional[Dict[str, Any]] = Field(None, description="详细信息")
    suggestion: Optional[str] = Field(None, description="修改建议")


class ConsistencyCheckRequest(BaseModel):
    """一致性检查请求"""
    chapter_ids: Optional[List[int]] = Field(None, description="指定检查的章节ID列表，为空则检查全部")
    check_types: List[str] = Field(
        default=["character", "plot", "timeline", "foreshadowing"],
        description="检查类型列表"
    )


class ConsistencyCheckResponse(BaseModel):
    """一致性检查响应"""
    check_id: str = Field(..., description="检查ID")
    novel_id: int = Field(..., description="小说ID")
    status: str = Field(..., description="检查状态")
    issues: List[ConsistencyIssue] = Field(default_factory=list, description="发现的问题列表")
    summary: Dict[str, Any] = Field(default_factory=dict, description="检查摘要")
    check_time: float = Field(..., description="检查耗时(秒)")
