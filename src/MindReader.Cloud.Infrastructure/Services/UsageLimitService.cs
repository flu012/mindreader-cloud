using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MindReader.Cloud.Application.Common.Interfaces;
using MindReader.Cloud.Domain.Entities;
using MindReader.Cloud.Domain.Enums;

namespace MindReader.Cloud.Infrastructure.Services;

public class UsageLimitService : IUsageLimitService
{
    private readonly ICloudDbContext _db;
    private readonly IGraphProxyService _proxy;
    private readonly IConfiguration _config;

    public UsageLimitService(ICloudDbContext db, IGraphProxyService proxy, IConfiguration config)
    {
        _db = db;
        _proxy = proxy;
        _config = config;
    }

    public async Task<bool> CanPerformAsync(int tenantId, OperationType operation)
    {
        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);
        if (tenant == null) return false;

        var limits = GetLimits(tenant.Tier);

        if (operation == OperationType.Evolve)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var evolvesToday = await _db.UsageLogs
                .Where(u => u.TenantId == tenantId && u.Operation == OperationType.Evolve && u.Date == today)
                .SumAsync(u => u.Count);
            return limits.MaxEvolvesPerDay < 0 || evolvesToday < limits.MaxEvolvesPerDay;
        }

        if (operation == OperationType.EntityCreate)
        {
            // Check entity count via proxy
            try
            {
                var resp = await _proxy.ForwardAsync("/api/stats", HttpMethod.Get, null, tenant.Neo4jTenantId);
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadAsStringAsync();
                    // Parse totals.nodes from the response
                    var doc = System.Text.Json.JsonDocument.Parse(json);
                    var entityCount = 0;
                    if (doc.RootElement.TryGetProperty("entityGroups", out var groups))
                    {
                        foreach (var prop in groups.EnumerateObject())
                            entityCount += prop.Value.GetInt32();
                    }
                    return limits.MaxEntities < 0 || entityCount < limits.MaxEntities;
                }
            }
            catch { /* If proxy fails, allow the operation */ }
            return true;
        }

        return true; // Other operations not limited
    }

    public async Task RecordUsageAsync(int tenantId, OperationType operation, int count = 1)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var existing = await _db.UsageLogs.FirstOrDefaultAsync(u =>
            u.TenantId == tenantId && u.Operation == operation && u.Date == today);

        if (existing != null)
        {
            existing.Count += count;
        }
        else
        {
            _db.UsageLogs.Add(new UsageLog
            {
                TenantId = tenantId,
                Operation = operation,
                Count = count,
                Date = today,
            });
        }
        await _db.SaveChangesAsync();
    }

    public async Task<UsageSummary> GetUsageSummaryAsync(int tenantId)
    {
        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);
        var limits = GetLimits(tenant?.Tier ?? TierType.Free);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var evolvesToday = await _db.UsageLogs
            .Where(u => u.TenantId == tenantId && u.Operation == OperationType.Evolve && u.Date == today)
            .SumAsync(u => u.Count);

        // Get entity/relationship count from Express
        int entityCount = 0, relCount = 0;
        if (tenant != null)
        {
            try
            {
                var resp = await _proxy.ForwardAsync("/api/stats", HttpMethod.Get, null, tenant.Neo4jTenantId);
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadAsStringAsync();
                    var doc = System.Text.Json.JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("entityGroups", out var groups))
                        foreach (var prop in groups.EnumerateObject()) entityCount += prop.Value.GetInt32();
                    if (doc.RootElement.TryGetProperty("relCounts", out var rels))
                        foreach (var rel in rels.EnumerateArray())
                            if (rel.TryGetProperty("count", out var c)) relCount += c.GetInt32();
                }
            }
            catch { /* ignore proxy errors */ }
        }

        return new UsageSummary
        {
            EntityCount = entityCount,
            RelationshipCount = relCount,
            EvolvesToday = evolvesToday,
            MaxEntities = limits.MaxEntities,
            MaxRelationships = limits.MaxRelationships,
            MaxEvolvesPerDay = limits.MaxEvolvesPerDay,
        };
    }

    private (int MaxEntities, int MaxRelationships, int MaxEvolvesPerDay) GetLimits(TierType tier)
    {
        var section = _config.GetSection($"UsageLimits:{tier}");
        return (
            section.GetValue<int>("MaxEntities", 100),
            section.GetValue<int>("MaxRelationships", 500),
            section.GetValue<int>("MaxEvolvesPerDay", 5)
        );
    }
}
