using MindReader.Cloud.Application.Common.Interfaces;

namespace MindReader.Cloud.Infrastructure.Services;

public class TenantService : ITenantService
{
    public int CurrentUserId => throw new NotImplementedException();
    public string CurrentTenantId => throw new NotImplementedException();
    public string CurrentTier => throw new NotImplementedException();
}
