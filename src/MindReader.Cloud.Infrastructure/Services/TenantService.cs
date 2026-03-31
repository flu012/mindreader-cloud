using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using MindReader.Cloud.Application.Common.Interfaces;

namespace MindReader.Cloud.Infrastructure.Services;

public class TenantService : ITenantService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public TenantService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private ClaimsPrincipal? User => _httpContextAccessor.HttpContext?.User;

    public int CurrentUserId =>
        int.TryParse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : 0;

    public string CurrentTenantId =>
        User?.FindFirst("tenant_id")?.Value ?? "master";

    public string CurrentTier =>
        User?.FindFirst("tier")?.Value ?? "Free";
}
