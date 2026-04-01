"""
小说管理模块 - 数据库模型
"""
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, Index, func, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from typing import Optional, Dict, Any, List

from app.core.database import Base


class Novel(Base):
    """小说模型 - 存储小说基本信息"""
    __tablename__ = "novels"
    
    id: int = Column(Integer, primary_key=True, autoincrement=True)
    title: str = Column(String(255), nullable=False, index=True)
    genre: Optional[str] = Column(String(100), index=True)
    description: Optional[str] = Column(Text)
    author_id: Optional[int] = Column(Integer)
    status: str = Column(String(50), default='draft', index=True)
    created_at: datetime = Column(TIMESTAMP, server_default=func.now())
    updated_at: Optional[datetime] = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    characters = relationship("Character", back_populates="novel")
    chapters = relationship("Chapter", back_populates="novel")
    plot_events = relationship("PlotEvent", back_populates="novel")
    foreshadowings = relationship("Foreshadowing", back_populates="novel")
    plot_lines = relationship("PlotLine", back_populates="novel", cascade="all, delete-orphan")
    plot_nodes = relationship("PlotNode", back_populates="novel", cascade="all, delete-orphan")
    plot_outline = relationship("PlotOutline", back_populates="novel", uselist=False, cascade="all, delete-orphan")
    creative_profile = relationship("NovelCreativeProfile", back_populates="novel", uselist=False, cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_novel_title_genre', 'title', 'genre'),
    )


class NovelCreativeProfile(Base):
    """作者创作偏好与协作配置"""
    __tablename__ = "novel_creative_profiles"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    novel_id: int = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    author_intent: Optional[str] = Column(Text)
    preferred_tone: Optional[str] = Column(String(255))
    collaboration_style: Optional[str] = Column(String(100), default="ai_ide")
    scene_planning_notes: Optional[str] = Column(Text)

    must_keep: Optional[List[str]] = Column(JSON)
    must_avoid: Optional[List[str]] = Column(JSON)
    long_term_goals: Optional[List[str]] = Column(JSON)
    extra_metadata: Optional[Dict[str, Any]] = Column(JSON)

    created_at: datetime = Column(TIMESTAMP, server_default=func.now())
    updated_at: Optional[datetime] = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    novel = relationship("Novel", back_populates="creative_profile")
