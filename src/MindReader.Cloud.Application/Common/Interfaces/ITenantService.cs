namespace MindReader.Cloud.Application.Common.Interfaces;

public interface ITenantService
{
    int CurrentUserId { get; }
    string CurrentTenantId { get; }
    string CurrentTier { get; }
}
