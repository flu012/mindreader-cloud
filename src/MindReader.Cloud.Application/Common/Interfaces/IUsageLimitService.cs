using MindReader.Cloud.Domain.Enums;

namespace MindReader.Cloud.Application.Common.Interfaces;

public interface IUsageLimitService
{
    Task<bool> CanPerformAsync(int tenantId, OperationType operation);
    Task RecordUsageAsync(int tenantId, OperationType operation, int count = 1);
    Task<UsageSummary> GetUsageSummaryAsync(int tenantId);
}

public class UsageSummary
{
    public int EntityCount { get; set; }
    public int RelationshipCount { get; set; }
    public int EvolvesToday { get; set; }
    public int MaxEntities { get; set; }
    public int MaxRelationships { get; set; }
    public int MaxEvolvesPerDay { get; set; }
}
