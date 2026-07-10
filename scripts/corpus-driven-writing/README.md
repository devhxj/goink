# Corpus-driven writing harnesses

## Scale harness durability

`run-scale-harness.ps1` starts the scale host with three independent outputs:

- `scale.stdout.json`: the host console result, retained for diagnostics and legacy finalization.
- `scale-progress.json`: `corpus-m2-scale-progress-v1`, atomically replaced by the host while loading, seeding, running, and completing.
- `scale-metrics.json`: `corpus-m2-scale-metrics-v1`, atomically written by the host after all measurements complete.

The wrapper validates `scale-metrics.json` but does not create it. A wrapper interruption therefore cannot prevent a still-running host from publishing the formal report.

For a legacy host that only writes a completed `scale.stdout.json`, run:

```powershell
./scripts/corpus-driven-writing/finalize-existing-scale.ps1
```

The finalizer is read-only with respect to the scale database. It refuses incomplete JSON, unsupported schemas, failed results, and results missing required measurement fields. It writes the metrics envelope through a same-directory temporary file and atomic rename.

Run the isolated smoke tests with:

```powershell
./scripts/corpus-driven-writing/test-scale-harness.ps1 -Configuration Release -BenchmarkWorkItems 1000
```

The test uses a new temporary fixture, database, stdout, progress, and metrics directory. It includes a medium-size benchmark that keeps the production thresholds at 20 work items/second, 100 ms claim P95, and 200 ms list P95, while asserting complete output, zero duplicates, and `post_finalize_job_reads=0`. It does not inspect or modify an existing scale run.
