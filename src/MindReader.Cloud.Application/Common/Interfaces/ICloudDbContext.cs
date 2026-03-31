using Microsoft.EntityFrameworkCore;
using MindReader.Cloud.Domain.Entities;

namespace MindReader.Cloud.Application.Common.Interfaces;

public interface ICloudDbContext
{
    DbSet<Tenant> Tenants { get; }
    DbSet<UsageLog> UsageLogs { get; }
    DbSet<ApiKey> ApiKeys { get; }
    DbSet<OAuthProvider> OAuthProviders { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
