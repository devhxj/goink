namespace Novelist.Core.App;

public interface IReferenceMaterializationEmbedder
{
    ValueTask<ReferenceMaterializationEmbeddingResult> EmbedAsync(
        ReferenceMaterializationEmbeddingRequest input,
        CancellationToken cancellationToken);
}

public sealed record ReferenceMaterializationEmbeddingModel(
    string Provider,
    string ModelId,
    int Dimensions);

public sealed record ReferenceMaterializationEmbeddingRequest(
    ReferenceMaterializationEmbeddingModel Model,
    IReadOnlyList<ReferenceMaterializationEmbeddingItem> Items);

public sealed record ReferenceMaterializationEmbeddingItem(
    string CandidateId,
    string Text);

public sealed record ReferenceMaterializationEmbeddingResult(
    IReadOnlyList<ReferenceMaterializationCandidateEmbedding> Embeddings);

public sealed record ReferenceMaterializationCandidateEmbedding(
    string CandidateId,
    IReadOnlyList<float> Vector);
