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
    active_story_arcs: list[dict] = field(default_factory=list)
    due_plot_nodes: list[dict] = field(default_factory=list)
    upcoming_plot_nodes: list[dict] = field(default_factory=list)
    timeline_entries: list[dict] = field(default_factory=list)
    priority_timeline_entries: list[dict] = field(default_factory=list)
    unresolved_foreshadowings: list[dict] = field(default_factory=list)
    due_foreshadowings: list[dict] = field(default_factory=list)
    retrieved_memory: list[dict] = field(default_factory=list)
    author_preferences: dict = field(default_factory=dict)
    feedback: str = ""

    @classmethod
    def from_task(cls, task) -> "WritingContext":
        """Create WritingContext from an AgentTask's context and parameters."""
        ctx = dict(task.context) if hasattr(task, "context") and task.context else {}
        params = task.parameters if hasattr(task, "parameters") else {}

        layered = ctx.pop("layered_context", None)
        if isinstance(layered, dict):
            for k, v in layered.items():
                ctx.setdefault(k, v)

        extra = ctx.pop("extra_parameters", None)
        if isinstance(extra, dict):
            for k, v in extra.items():
                params.setdefault(k, v)

        instruction = ctx.pop("instruction", None)
        if instruction and not params.get("writing_task"):
            params.setdefault("writing_task", instruction)

        chapter_info = ctx.get("chapter_info")
        if isinstance(chapter_info, dict) and not params.get("chapter_number"):
            params.setdefault("chapter_number", chapter_info.get("chapter_number", 1))

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
            active_story_arcs=ctx.get("active_story_arcs", []),
            due_plot_nodes=ctx.get("due_plot_nodes", []),
            upcoming_plot_nodes=ctx.get("upcoming_plot_nodes", []),
            timeline_entries=ctx.get("timeline_entries", []),
            priority_timeline_entries=ctx.get("priority_timeline_entries", []),
            unresolved_foreshadowings=ctx.get("unresolved_foreshadowings", []),
            due_foreshadowings=ctx.get("due_foreshadowings", []),
            retrieved_memory=ctx.get("retrieved_memory", []),
            author_preferences=ctx.get("author_preferences", {}),
            feedback=params.get("feedback", ""),
        )
