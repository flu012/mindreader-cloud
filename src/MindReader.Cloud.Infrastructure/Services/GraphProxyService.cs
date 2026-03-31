using MindReader.Cloud.Application.Common.Interfaces;

namespace MindReader.Cloud.Infrastructure.Services;

public class GraphProxyService : IGraphProxyService
{
    public Task<HttpResponseMessage> ForwardAsync(string path, HttpMethod method, string? body, string tenantId) => throw new NotImplementedException();
}
