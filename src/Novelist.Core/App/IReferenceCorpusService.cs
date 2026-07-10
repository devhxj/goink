using Novelist.Contracts.App;

namespace Novelist.Core.App;

public interface IReferenceCorpusService
{
    ValueTask<PageResultPayload<ReferenceCorpusCandidatePayload>> SearchCandidatesAsync(
        SearchReferenceCorpusCandidatesPayload input,
        CancellationToken cancellationToken);

ValueTask<ReferenceCorpusTechniqueVectorIndexBackfillPayload> BackfillTechniqueVectorIndexAsync(
BackfillReferenceCorpusTechniqueVectorIndexPayload input,
CancellationToken cancellationToken);

 ValueTask<ReferenceCorpusTechniqueVectorMaintenanceJobPayload> ScheduleTechniqueVectorMaintenanceAsync(
 ScheduleReferenceCorpusTechniqueVectorMaintenancePayload input,
 CancellationToken cancellationToken) => throw new NotSupportedException();

 ValueTask<ReferenceCorpusTechniqueVectorMaintenancePumpResultPayload> PumpTechniqueVectorMaintenanceAsync(
 PumpReferenceCorpusTechniqueVectorMaintenancePayload input,
 CancellationToken cancellationToken) => throw new NotSupportedException();

 ValueTask<ReferenceCorpusTechniqueVectorIndexInspectionPayload> InspectTechniqueVectorIndexesAsync(
 InspectReferenceCorpusTechniqueVectorIndexesPayload input,
 CancellationToken cancellationToken) => throw new NotSupportedException();

 ValueTask<ReferenceCorpusProjectionRebuildPayload> RebuildSensoryProjectionAsync(
 RebuildReferenceCorpusSensoryProjectionPayload input,
 CancellationToken cancellationToken) => throw new NotSupportedException();

ValueTask<ReferenceCorpusNodeWindowPayload?> GetNodeWindowAsync(
GetReferenceCorpusNodeWindowPayload input,
CancellationToken cancellationToken) => throw new NotSupportedException();

 ValueTask<ReferenceCorpusCascadeImpactPayload> GetCascadeImpactAsync(
 GetReferenceCorpusCascadeImpactPayload input,
 CancellationToken cancellationToken) => throw new NotSupportedException();
}
