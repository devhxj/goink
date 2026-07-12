using Novelist.Contracts.App;
using Novelist.Core.App;

namespace Novelist.Infrastructure.App;

public sealed class ReferenceMaterializationWorker
{
    private static readonly TimeSpan DefaultLeaseDuration = TimeSpan.FromMinutes(10);
    private readonly IReferenceCorpusDatabasePathResolver _databasePathResolver;
    private readonly IReferenceMaterializationQualifier _qualifier;
    private readonly IReferenceMaterializationEmbedder _embedder;
    private readonly ReferenceMaterializationVectorIndexer _indexer;
    private readonly string _workerId;
    private readonly TimeSpan _leaseDuration;

    public ReferenceMaterializationWorker(
        IReferenceCorpusDatabasePathResolver databasePathResolver,
        IReferenceMaterializationQualifier qualifier,
        IReferenceMaterializationEmbedder embedder,
        ReferenceMaterializationVectorIndexer indexer,
        string? workerId = null,
        TimeSpan? leaseDuration = null)
    {
        _databasePathResolver = databasePathResolver ?? throw new ArgumentNullException(nameof(databasePathResolver));
        _qualifier = qualifier ?? throw new ArgumentNullException(nameof(qualifier));
        _embedder = embedder ?? throw new ArgumentNullException(nameof(embedder));
        _indexer = indexer ?? throw new ArgumentNullException(nameof(indexer));
        _workerId = string.IsNullOrWhiteSpace(workerId)
            ? $"materialization-worker:{Environment.ProcessId}:{Guid.NewGuid():N}"
            : workerId;
        _leaseDuration = leaseDuration ?? DefaultLeaseDuration;
        if (_leaseDuration <= TimeSpan.Zero || _leaseDuration > TimeSpan.FromMinutes(30))
        {
            throw new ArgumentOutOfRangeException(nameof(leaseDuration));
        }
    }

    public async ValueTask<bool> ProcessRunOnceAsync(string runId, CancellationToken cancellationToken)
    {
        var store = new SqliteReferenceMaterializationRunStore(_databasePathResolver);
        var claim = await store.ClaimCurrentBatchAsync(runId, _workerId, _leaseDuration, cancellationToken);
        if (claim is null)
        {
            return false;
        }

        try
        {
            using var batchCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var tasks = claim.ChapterIndexes
                .Select(chapterIndex => ProcessChapterAsync(store, claim.RunId, chapterIndex, batchCancellation.Token))
                .ToArray();
            try
            {
                await Task.WhenAll(tasks);
            }
            catch
            {
                batchCancellation.Cancel();
                try
                {
                    await Task.WhenAll(tasks);
                }
                catch
                {
                }

                throw;
            }

            await _indexer.IndexCurrentBatchAsync(claim.RunId, cancellationToken);
            await store.ReleaseBatchLeaseAsync(claim, cancellationToken);
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            await store.ReleaseBatchLeaseAsync(claim, CancellationToken.None);
            throw;
        }
        catch (ReferenceMaterializationException exception)
        {
            await store.FailCurrentBatchAsync(claim, exception.ErrorCode, Sanitize(exception.Message), CancellationToken.None);
            return true;
        }
        catch (Exception exception)
        {
            await store.FailCurrentBatchAsync(
                claim,
                ReferenceMaterializationErrorCodes.LlmRequestFailed,
                Sanitize(exception.Message),
                CancellationToken.None);
            return true;
        }
    }

    private async Task ProcessChapterAsync(
        SqliteReferenceMaterializationRunStore store,
        string runId,
        int chapterIndex,
        CancellationToken cancellationToken)
    {
        var candidates = await store.BuildCandidatesForChapterAsync(runId, chapterIndex, cancellationToken);
        if (candidates.CandidateCount == 0)
        {
            await store.CompleteEmptyQualificationAsync(runId, chapterIndex, cancellationToken);
            await store.CompleteEmptyEmbeddingAsync(runId, chapterIndex, cancellationToken);
            return;
        }

        var qualificationWork = await store.ReadQualificationWorkItemAsync(runId, chapterIndex, cancellationToken);
        var qualification = await _qualifier.QualifyAsync(qualificationWork.Request, cancellationToken);
        var persistedQualification = await store.PersistQualificationAsync(runId, chapterIndex, qualification, cancellationToken);
        if (persistedQualification.AcceptedCount == 0)
        {
            await store.CompleteEmptyEmbeddingAsync(runId, chapterIndex, cancellationToken);
            return;
        }

        var embeddingWork = await store.ReadEmbeddingWorkItemAsync(runId, chapterIndex, cancellationToken);
        var embeddings = await _embedder.EmbedAsync(embeddingWork.Request, cancellationToken);
        await store.PersistEmbeddingsAsync(runId, chapterIndex, embeddings, cancellationToken);
    }

    private static string Sanitize(string value)
    {
        var normalized = value?.Replace('\r', ' ').Replace('\n', ' ').Trim() ?? string.Empty;
        return normalized.Length <= 1_200 ? normalized : normalized[..1_200];
    }
}
