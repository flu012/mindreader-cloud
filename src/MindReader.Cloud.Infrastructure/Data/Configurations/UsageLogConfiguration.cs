using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MindReader.Cloud.Domain.Entities;

namespace MindReader.Cloud.Infrastructure.Data.Configurations;

public class UsageLogConfiguration : IEntityTypeConfiguration<UsageLog>
{
    public void Configure(EntityTypeBuilder<UsageLog> builder)
    {
        builder.HasIndex(u => new { u.TenantId, u.Date, u.Operation });
    }
}
