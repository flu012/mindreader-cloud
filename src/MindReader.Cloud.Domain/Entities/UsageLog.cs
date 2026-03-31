namespace MindReader.Cloud.Domain.Entities;

using MindReader.Cloud.Domain.Common;
using MindReader.Cloud.Domain.Enums;

public class UsageLog : BaseEntity
{
    public int TenantId { get; set; }
    public OperationType Operation { get; set; }
    public int Count { get; set; } = 1;
    public DateOnly Date { get; set; } = DateOnly.FromDateTime(DateTime.UtcNow);
}
