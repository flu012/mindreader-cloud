namespace MindReader.Cloud.Application.Common.Interfaces;

public interface IGraphProxyService
{
    Task<HttpResponseMessage> ForwardAsync(string path, HttpMethod method, string? body, string tenantId);
}
