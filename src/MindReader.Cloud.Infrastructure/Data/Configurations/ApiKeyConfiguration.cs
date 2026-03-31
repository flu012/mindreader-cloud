using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MindReader.Cloud.Domain.Entities;

namespace MindReader.Cloud.Infrastructure.Data.Configurations;

public class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.HasIndex(a => new { a.TenantId, a.Provider }).IsUnique();
        builder.Property(a => a.Provider).HasMaxLength(50).IsRequired();
        builder.Property(a => a.EncryptedKey).HasMaxLength(500).IsRequired();
    }
}
