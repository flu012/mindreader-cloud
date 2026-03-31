using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using MindReader.Cloud.Application.Common.Interfaces;
using MindReader.Cloud.Domain.Entities;
using MindReader.Cloud.Infrastructure.Identity;

namespace MindReader.Cloud.Infrastructure.Data;

public class CloudDbContext : IdentityDbContext<ApplicationUser, IdentityRole<int>, int>, ICloudDbContext
{
    public CloudDbContext(DbContextOptions<CloudDbContext> options) : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<UsageLog> UsageLogs => Set<UsageLog>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<OAuthProvider> OAuthProviders => Set<OAuthProvider>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(CloudDbContext).Assembly);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Added)
            {
                var createdAt = entry.Entity.GetType().GetProperty("CreatedAt");
                if (createdAt?.PropertyType == typeof(DateTimeOffset))
                {
                    var current = (DateTimeOffset)createdAt.GetValue(entry.Entity)!;
                    if (current == default) createdAt.SetValue(entry.Entity, DateTimeOffset.UtcNow);
                }
            }
        }
        return await base.SaveChangesAsync(cancellationToken);
    }
}
