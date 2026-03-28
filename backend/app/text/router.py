"""
文本生成API路由
"""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.dependencies import NovelOwner
from app.text.service import TextGenerator, GenerationType, GenerationConfig

router = APIRouter(prefix="/text", tags=["text-generation"])
logger = logging.getLogger(__name__)


@router.post("/novels/{novel_id}/generate/chapter")
async def generate_chapter(
    novel: NovelOwner,
    chapter_number: int,
    target_length: int = 3000,
    style: str = "narrative",
    db: Session = Depends(get_db)
):
    """
    生成章节
    
    - chapter_number: 章节号
    - target_length: 目标字数
    - style: 写作风格
    """
    generator = TextGenerator(db, novel.id)
    result = await generator.generate_chapter(
        chapter_number=chapter_number,
        target_length=target_length,
        style=style
    )
    
    return ApiResponse.success(result)


@router.post("/novels/{novel_id}/generate/dialogue")
async def generate_dialogue(
    novel: NovelOwner,
    characters: list,
    context: str,
    style: str = "natural",
    db: Session = Depends(get_db)
):
    """
    生成对话
    
    - characters: 参与对话的角色列表
    - context: 对话场景背景
    - style: 对话风格
    """
    generator = TextGenerator(db, novel.id)
    result = await generator.generate_dialogue(
        characters=characters,
        context=context,
        style=style
    )
    
    return ApiResponse.success(result)


@router.post("/novels/{novel_id}/generate/description")
async def generate_description(
    novel: NovelOwner,
    subject: str,
    style: str = "vivid",
    db: Session = Depends(get_db)
):
    """
    生成描写
    
    - subject: 描写对象
    - style: 描写风格
    """
    generator = TextGenerator(db, novel.id)
    result = await generator.generate_description(
        subject=subject,
        style=style
    )
    
    return ApiResponse.success(result)


@router.post("/novels/{novel_id}/generate/outline")
async def generate_outline(
    novel: NovelOwner,
    premise: str,
    genre: str,
    total_chapters: int = 20,
    style: str = "narrative",
    db: Session = Depends(get_db)
):
    """
    生成大纲
    
    - premise: 故事前提
    - genre: 类型
    - total_chapters: 总章节数
    - style: 写作风格
    """
    generator = TextGenerator(db, novel.id)
    result = await generator.generate_outline(
        premise=premise,
        genre=genre,
        total_chapters=total_chapters,
        style=style
    )
    
    return ApiResponse.success(result)


@router.post("/novels/{novel_id}/generate/summary")
async def generate_summary(
    novel: NovelOwner,
    content: str,
    max_length: int = 500,
    db: Session = Depends(get_db)
):
    """
    生成摘要
    
    - content: 原文内容
    - max_length: 最大长度
    """
    generator = TextGenerator(db, novel.id)
    result = await generator.generate_summary(
        content=content,
        max_length=max_length
    )
    
    return ApiResponse.success(result)


@router.post("/novels/{novel_id}/generate/character-profile")
async def generate_character_profile(
    novel: NovelOwner,
    name: str,
    role: str,
    novel_context: str,
    style: str = "narrative",
    db: Session = Depends(get_db)
):
    """
    生成角色档案
    
    - name: 角色名
    - role: 角色定位
    - novel_context: 小说背景
    - style: 写作风格
    """
    generator = TextGenerator(db, novel.id)
    result = await generator.generate_character_profile(
        name=name,
        role=role,
        novel_context=novel_context,
        style=style
    )
    
    return ApiResponse.success(result)


@router.post("/novels/{novel_id}/generate/custom")
async def generate_custom(
    novel: NovelOwner,
    prompt: str,
    generation_type: str = "chapter",
    style: str = "narrative",
    target_length: int = 3000,
    temperature: float = 0.8,
    db: Session = Depends(get_db)
):
    """
    自定义生成
    
    - prompt: 自定义提示词
    - generation_type: 生成类型
    - style: 写作风格
    - target_length: 目标字数
    - temperature: 创造性程度 (0.0-1.0)
    """
    try:
        gen_type = GenerationType(generation_type)
    except ValueError:
        gen_type = GenerationType.CHAPTER
    
    config = GenerationConfig(
        generation_type=gen_type,
        style=style,
        target_length=target_length,
        temperature=temperature
    )
    
    generator = TextGenerator(db, novel.id)
    result = await generator.generate(prompt=prompt, config=config)
    
    return ApiResponse.success(result)


@router.get("/generation-types")
def get_generation_types():
    """获取支持的生成类型"""
    return ApiResponse.success({
        "types": [
            {"value": "chapter", "label": "章节生成"},
            {"value": "dialogue", "label": "对话生成"},
            {"value": "description", "label": "描写生成"},
            {"value": "outline", "label": "大纲生成"},
            {"value": "summary", "label": "摘要生成"},
            {"value": "character_profile", "label": "角色档案生成"}
        ],
        "styles": [
            {"value": "narrative", "label": "叙述性"},
            {"value": "descriptive", "label": "描写性"},
            {"value": "dialogue", "label": "对话式"},
            {"value": "poetic", "label": "诗意"},
            {"value": "dramatic", "label": "戏剧性"},
            {"value": "natural", "label": "自然"},
            {"value": "vivid", "label": "生动"}
        ]
    })
