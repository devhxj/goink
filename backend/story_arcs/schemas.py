"""
叙事弧线模块 - Pydantic Schemas
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Any
from datetime import datetime
from enum import Enum


class StoryArcType(str, Enum):
    MAIN = "main"
    SUB = "sub"
    CHARACTER = "character"
    BACKGROUND = "background"


class StoryArcStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class StoryArcCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="弧线名称")
    description: str | None = Field(default=None, description="弧线描述")
    arc_type: StoryArcType = Field(default=StoryArcType.SUB, description="弧线类型")
    start_chapter: int | None = Field(default=None, description="起始章节")
    end_chapter: int | None = Field(default=None, description="结束章节")
    importance: int = Field(default=1, ge=1, le=5, description="重要程度 1-5")
    extra_metadata: dict[str, Any] | None = Field(default=None, description="额外元数据")


class StoryArcUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None)
    arc_type: StoryArcType | None = Field(default=None)
    start_chapter: int | None = Field(default=None)
    end_chapter: int | None = Field(default=None)
    importance: int | None = Field(default=None, ge=1, le=5)
    status: StoryArcStatus | None = Field(default=None)
    extra_metadata: dict[str, Any] | None = Field(default=None)


class StoryArcResponse(BaseModel):
    id: int
    novel_id: int
    name: str
    description: str | None = None
    arc_type: str
    start_chapter: int | None = None
    end_chapter: int | None = None
    importance: int
    status: str
    extra_metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
