namespace MindReader.Cloud.Domain.Common;

public abstract class BaseEntity
{
    public int Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
