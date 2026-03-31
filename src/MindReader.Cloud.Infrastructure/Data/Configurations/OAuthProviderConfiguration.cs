using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MindReader.Cloud.Domain.Entities;

namespace MindReader.Cloud.Infrastructure.Data.Configurations;

public class OAuthProviderConfiguration : IEntityTypeConfiguration<OAuthProvider>
{
    public void Configure(EntityTypeBuilder<OAuthProvider> builder)
    {
        builder.HasIndex(o => new { o.Provider, o.ExternalId }).IsUnique();
        builder.Property(o => o.Provider).HasMaxLength(50).IsRequired();
        builder.Property(o => o.ExternalId).HasMaxLength(200).IsRequired();
    }
}
