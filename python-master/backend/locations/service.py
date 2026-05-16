"""
地点管理模块 - 服务层
"""
import logging
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from .models import Location
from .schemas import LocationCreate, LocationUpdate

logger = logging.getLogger(__name__)


class LocationService:
    """地点服务"""

    def __init__(self, db: AsyncSession, novel_id: int):
        self.db = db
        self.novel_id = novel_id

    async def get_all(self) -> list[Location]:
        result = await self.db.execute(
            select(Location).where(Location.novel_id == self.novel_id).order_by(Location.name)
        )
        return list(result.scalars().all())

    async def get_by_id(self, location_id: int) -> Location | None:
        return await self.db.get(Location, location_id)

    async def get_children(self, parent_id: int) -> list[Location]:
        result = await self.db.execute(
            select(Location).where(
                Location.novel_id == self.novel_id,
                Location.parent_location_id == parent_id,
            ).order_by(Location.name)
        )
        return list(result.scalars().all())

    async def get_by_type(self, location_type: str) -> list[Location]:
        result = await self.db.execute(
            select(Location).where(
                Location.novel_id == self.novel_id,
                Location.location_type == location_type,
            ).order_by(Location.name)
        )
        return list(result.scalars().all())

    async def search(self, query: str) -> list[Location]:
        result = await self.db.execute(
            select(Location).where(
                Location.novel_id == self.novel_id,
                or_(
                    Location.name.ilike(f"%{query}%"),
                    Location.description.ilike(f"%{query}%"),
                ),
            ).order_by(Location.name)
        )
        return list(result.scalars().all())

    async def create(self, data: LocationCreate) -> Location:
        location = Location(novel_id=self.novel_id, **data.model_dump())
        self.db.add(location)
        await self.db.commit()
        await self.db.refresh(location)
        return location

    async def update(self, location_id: int, data: LocationUpdate) -> Location | None:
        location = await self.db.get(Location, location_id)
        if not location or location.novel_id != self.novel_id:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(location, key, value)
        await self.db.commit()
        await self.db.refresh(location)
        return location

    async def delete(self, location_id: int) -> bool:
        location = await self.db.get(Location, location_id)
        if not location or location.novel_id != self.novel_id:
            return False
        await self.db.delete(location)
        await self.db.commit()
        return True

    async def get_network(self) -> dict[str, Any]:
        """获取地点层级网络结构"""
        all_locations = await self.get_all()
        
        nodes = []
        edges = []
        root_locations = []
        
        loc_map = {loc.id: loc for loc in all_locations}
        
        for loc in all_locations:
            children_count = sum(1 for l in all_locations if l.parent_location_id == loc.id)
            node = {
                "id": loc.id,
                "name": loc.name,
                "type": loc.location_type,
                "has_children": children_count > 0,
                "description": loc.description[:100] if loc.description else None,
            }
            nodes.append(node)
            
            if not loc.parent_location_id:
                root_locations.append(node)
            else:
                parent = loc_map.get(loc.parent_location_id)
                if parent:
                    edges.append({
                        "parent_id": parent.id,
                        "parent_name": parent.name,
                        "child_id": loc.id,
                        "child_name": loc.name,
                    })
        
        return {
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(nodes),
            "root_locations": root_locations,
        }

    async def get_for_chapter(self, chapter_id: int) -> list[Location]:
        result = await self.db.execute(
            select(Location).where(
                Location.novel_id == self.novel_id,
                Location.first_appearance_chapter_id == chapter_id,
            ).order_by(Location.name)
        )
        return list(result.scalars().all())
