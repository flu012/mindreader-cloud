using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MindReader.Cloud.Domain.Entities;

namespace MindReader.Cloud.Infrastructure.Data.Configurations;

public class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.HasIndex(t => t.UserId).IsUnique();
        builder.HasIndex(t => t.Neo4jTenantId).IsUnique();
        builder.Property(t => t.Neo4jTenantId).HasMaxLength(100).IsRequired();
    }
}
