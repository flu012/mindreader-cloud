namespace MindReader.Cloud.Domain.Entities;

using MindReader.Cloud.Domain.Common;

public class OAuthProvider : BaseEntity
{
    public int UserId { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string ExternalId { get; set; } = string.Empty;
    public string? Email { get; set; }
}
