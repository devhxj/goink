"""
小说管理模块 - Pydantic Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class NovelBase(BaseModel):
    title: str
    genre: Optional[str] = None
    description: Optional[str] = None
    author_id: Optional[int] = None


class NovelCreate(NovelBase):
    pass


class NovelUpdate(BaseModel):
    title: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class NovelResponse(NovelBase):
    id: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class CreativeProfileBase(BaseModel):
    author_intent: Optional[str] = Field(None, description="作者长期创作意图")
    preferred_tone: Optional[str] = Field(None, description="默认语气/文风偏好")
    collaboration_style: Optional[str] = Field(None, description="协作风格，例如 ai_ide")
    scene_planning_notes: Optional[str] = Field(None, description="场景推进与章节规划备注")
    must_keep: Optional[List[str]] = Field(None, description="长期必须保留或遵守的规则")
    must_avoid: Optional[List[str]] = Field(None, description="长期明确避免的内容")
    long_term_goals: Optional[List[str]] = Field(None, description="长线创作目标")
    extra_metadata: Optional[Dict[str, Any]] = Field(None, description="额外配置")


class CreativeProfileUpdate(CreativeProfileBase):
    pass


class CreativeProfileResponse(CreativeProfileBase):
    id: int
    novel_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
