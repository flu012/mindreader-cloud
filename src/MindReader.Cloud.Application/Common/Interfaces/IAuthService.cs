using MindReader.Cloud.Domain.Common;

namespace MindReader.Cloud.Application.Common.Interfaces;

public interface IAuthService
{
    Task<AuthResult> RegisterAsync(string email, string password, string name);
    Task<AuthResult> LoginAsync(string email, string password);
    Task<AuthResult> RefreshTokenAsync(string refreshToken);
    Task<AuthResult> GoogleLoginAsync(string idToken);
    Task<AuthResult> GitHubLoginAsync(string code);
}
