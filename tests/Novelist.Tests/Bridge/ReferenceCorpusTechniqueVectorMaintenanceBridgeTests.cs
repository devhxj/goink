using System.Text.Json;
using Novelist.Contracts.App;
using Novelist.Contracts.Bridge;
using Novelist.Core.App;
using Novelist.Core.Bridge;

namespace Novelist.Tests.Bridge;

public sealed class ReferenceCorpusTechniqueVectorMaintenanceBridgeTests
{
 [Fact]
 public async Task RoutesSchedulePumpAndInspection()
 {
 var service = new FakeService();
 var dispatcher = new BridgeDispatcher().RegisterReferenceCorpusHandlers(service);
 var context = QueryContext();
 using var scheduled = await DispatchAsync(dispatcher, "ScheduleReferenceCorpusTechniqueVectorMaintenance",
 new ScheduleReferenceCorpusTechniqueVectorMaintenancePayload(context, ReferenceCorpusNodeTypes.Sentence, "full", 4));
 using var pumped = await DispatchAsync(dispatcher, "PumpReferenceCorpusTechniqueVectorMaintenance",
 new PumpReferenceCorpusTechniqueVectorMaintenancePayload("bridge-worker", 90));
 using var inspected = await DispatchAsync(dispatcher, "InspectReferenceCorpusTechniqueVectorIndexes",
 new InspectReferenceCorpusTechniqueVectorIndexesPayload(true));

 Assert.True(scheduled.RootElement.GetProperty("ok").GetBoolean(), scheduled.RootElement.GetRawText());
 Assert.True(pumped.RootElement.GetProperty("ok").GetBoolean(), pumped.RootElement.GetRawText());
 Assert.True(inspected.RootElement.GetProperty("ok").GetBoolean(), inspected.RootElement.GetRawText());
 Assert.Equal(["schedule:full:4", "pump:bridge-worker:90", "inspect:True"], service.Calls);
 Assert.True(pumped.RootElement.GetProperty("result").GetProperty("processed").GetBoolean());
 Assert.Equal(1, inspected.RootElement.GetProperty("result").GetProperty("healthy_count").GetInt32());
 }

 private static async Task<JsonDocument> DispatchAsync(BridgeDispatcher dispatcher, string method, object input)
 {
 var payload = JsonSerializer.Serialize(new
 {
 kind = "request", id = "m3-maintenance", method,
 payload = new { args = new object?[] { input } }
 }, BridgeJson.SerializerOptions);
 var result = await dispatcher.DispatchAsync(payload);
 return JsonDocument.Parse(result.OutboundJson!);
 }

 private static ReferenceCorpusQueryContextPayload QueryContext() => new(
 "scene", "emotion", "pacing", "position", "mechanic", [], [],
 new(1, 1, "draft", 0, null, []),
 new(["library"], [ReferenceCorpusReusePolicies.AdaptedOnly], [], []));

 private sealed class FakeService : IReferenceCorpusService
 {
 public List<string> Calls { get; } = [];
 public ValueTask<PageResultPayload<ReferenceCorpusCandidatePayload>> SearchCandidatesAsync(SearchReferenceCorpusCandidatesPayload input, CancellationToken cancellationToken) => throw new NotSupportedException();
 public ValueTask<ReferenceCorpusTechniqueVectorIndexBackfillPayload> BackfillTechniqueVectorIndexAsync(BackfillReferenceCorpusTechniqueVectorIndexPayload input, CancellationToken cancellationToken) => throw new NotSupportedException();
 public ValueTask<ReferenceCorpusTechniqueVectorMaintenanceJobPayload> ScheduleTechniqueVectorMaintenanceAsync(ScheduleReferenceCorpusTechniqueVectorMaintenancePayload input, CancellationToken cancellationToken)
 {
 Calls.Add($"schedule:{input.Mode}:{input.MaxAttempts}");
 return ValueTask.FromResult(Job(input.Mode));
 }
 public ValueTask<ReferenceCorpusTechniqueVectorMaintenancePumpResultPayload> PumpTechniqueVectorMaintenanceAsync(PumpReferenceCorpusTechniqueVectorMaintenancePayload input, CancellationToken cancellationToken)
 {
 Calls.Add($"pump:{input.WorkerId}:{input.LeaseSeconds}");
 return ValueTask.FromResult(new ReferenceCorpusTechniqueVectorMaintenancePumpResultPayload(true, Job("full"), null));
 }
 public ValueTask<ReferenceCorpusTechniqueVectorIndexInspectionPayload> InspectTechniqueVectorIndexesAsync(InspectReferenceCorpusTechniqueVectorIndexesPayload input, CancellationToken cancellationToken)
 {
 Calls.Add($"inspect:{input.IncludeCompletedJobs}");
 return ValueTask.FromResult(new ReferenceCorpusTechniqueVectorIndexInspectionPayload(
 "fake", "model", 8,
 [new("scope", "table", "fake", "model", 8, 1, 1, "healthy", [], DateTimeOffset.UnixEpoch)],
 [Job("full")], 1, 0, 0));
 }
 private static ReferenceCorpusTechniqueVectorMaintenanceJobPayload Job(string mode) => new(
 "job", "scope", mode, "completed", "fake", "model", 8, 1, 4, null, null, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch);
 }
}
