using MindReader.Cloud.Application.Common.Interfaces;
using MindReader.Cloud.Domain.Enums;

namespace MindReader.Cloud.Infrastructure.Services;

public class UsageLimitService : IUsageLimitService
{
    public Task<bool> CanPerformAsync(int tenantId, OperationType operation) => throw new NotImplementedException();
    public Task RecordUsageAsync(int tenantId, OperationType operation, int count = 1) => throw new NotImplementedException();
    public Task<UsageSummary> GetUsageSummaryAsync(int tenantId) => throw new NotImplementedException();
}
