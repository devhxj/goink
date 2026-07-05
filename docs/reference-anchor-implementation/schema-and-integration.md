# Reference Anchor Schema and Integration Plan

[Back to implementation index](../reference-anchor-implementation-plan.md).

This file is the stable schema and integration entry point. The detailed integration notes are split by runtime surface.

## Integration Documents

- [Database schema](schema-database.md): reference-anchor SQLite tables, core columns, indexes, and foreign-key policy.
- [Bridge API surface](schema-bridge-api.md): Photino bridge methods, payload behavior, ranking explanation surface, and handler pattern.
- [Desktop and agent integration](schema-desktop-and-agent.md): Photino composition, service wiring, MAF reference tools, schema limits, and enforced agent workflow order.
- [Frontend surface](schema-frontend.md): TypeScript bridge namespace, reference-anchor components, shell integration, current UI status, stale blueprint behavior, and desktop debugging notes.
