namespace MindReader.Cloud.Domain.Entities;

using MindReader.Cloud.Domain.Common;
using MindReader.Cloud.Domain.Enums;

public class Tenant : BaseEntity
{
    public int UserId { get; set; }
    public string Neo4jTenantId { get; set; } = Guid.NewGuid().ToString();
    public TierType Tier { get; set; } = TierType.Free;
    public bool IsActive { get; set; } = true;
}
