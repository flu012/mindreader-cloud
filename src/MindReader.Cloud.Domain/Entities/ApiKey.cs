namespace MindReader.Cloud.Domain.Entities;

using MindReader.Cloud.Domain.Common;

public class ApiKey : BaseEntity
{
    public int TenantId { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string EncryptedKey { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
