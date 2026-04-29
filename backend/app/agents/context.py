"""
Writing context data structure for WriterAgent.

Encapsulates all context needed for chapter generation,
replacing the previous 29-parameter approach.
"""
from dataclasses import dataclass, field


@dataclass
class WritingContext:
    chapter_number: int
    target_length: int = 3000
    style: str = "narrative"
    writing_task: str = ""
    tone: str = ""
    outline: str = ""
    author_intent: str = ""
    scene_goal: str = ""
    must_keep: list[str] = field(default_factory=list)
    must_avoid: list[str] = field(default_factory=list)
    revision: bool = False
    issues: list[dict] = field(default_factory=list)
    previous_summary: str = ""
    characters: list[dict] = field(default_factory=list)
    plot_hints: list[dict] = field(default_factory=list)
    story_outline: dict = field(default_factory=dict)
    active_plot_lines: list[dict] = field(default_factory=list)
    due_plot_nodes: list[dict] = field(default_factory=list)
    upcoming_plot_nodes: list[dict] = field(default_factory=list)
    timeline_entries: list[dict] = field(default_factory=list)
    priority_timeline_entries: list[dict] = field(default_factory=list)
    unresolved_foreshadowings: list[dict] = field(default_factory=list)
    due_foreshadowings: list[dict] = field(default_factory=list)
    retrieved_memory: list[dict] = field(default_factory=list)
    prewrite_recommendations: list[str] = field(default_factory=list)
    chapter_mission: dict = field(default_factory=dict)
    story_brief: str = ""
    current_arc_summary: str = ""
    author_preferences: dict = field(default_factory=dict)
    feedback: str = ""

    @classmethod
    def from_task(cls, task) -> "WritingContext":
        """Create WritingContext from an AgentTask's context and parameters."""
        ctx = task.context if hasattr(task, "context") else {}
        params = task.parameters if hasattr(task, "parameters") else {}

        return cls(
            chapter_number=params.get("chapter_number", 1),
            target_length=params.get("target_length", 3000),
            style=params.get("style", "narrative"),
            writing_task=params.get("writing_task", ""),
            tone=params.get("tone", ""),
            outline=params.get("outline", ""),
            author_intent=params.get("author_intent", ""),
            scene_goal=params.get("scene_goal", ""),
            must_keep=params.get("must_keep", []),
            must_avoid=params.get("must_avoid", []),
            revision=params.get("revision", False),
            issues=params.get("issues", []),
            previous_summary=ctx.get("previous_summary", ""),
            characters=ctx.get("characters", []),
            plot_hints=ctx.get("plot_hints", []),
            story_outline=ctx.get("story_outline", {}),
            active_plot_lines=ctx.get("active_plot_lines", []),
            due_plot_nodes=ctx.get("due_plot_nodes", []),
            upcoming_plot_nodes=ctx.get("upcoming_plot_nodes", []),
            timeline_entries=ctx.get("timeline_entries", []),
            priority_timeline_entries=ctx.get("priority_timeline_entries", []),
            unresolved_foreshadowings=ctx.get("unresolved_foreshadowings", []),
            due_foreshadowings=ctx.get("due_foreshadowings", []),
            retrieved_memory=ctx.get("retrieved_memory", []),
            prewrite_recommendations=ctx.get("prewrite_recommendations", []),
            chapter_mission=ctx.get("chapter_mission", {}),
            story_brief=ctx.get("story_brief", ""),
            current_arc_summary=ctx.get("current_arc_summary", ""),
            author_preferences=ctx.get("author_preferences", {}),
            feedback=params.get("feedback", ""),
        )
