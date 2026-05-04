"""
默认Agent装配工厂
"""
from .coordinator import CoordinatorAgent
from .writer import WriterAgent
from .reviewer import ReviewerAgent


def create_default_coordinator() -> CoordinatorAgent:
    from .memory import MemoryAgent

    coordinator = CoordinatorAgent()
    coordinator.register_agent(WriterAgent())
    coordinator.register_agent(ReviewerAgent())
    coordinator.register_agent(MemoryAgent())
    return coordinator
