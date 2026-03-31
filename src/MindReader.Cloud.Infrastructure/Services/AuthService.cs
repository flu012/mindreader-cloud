using MindReader.Cloud.Application.Common.Interfaces;
using MindReader.Cloud.Domain.Common;

namespace MindReader.Cloud.Infrastructure.Services;

public class AuthService : IAuthService
{
    public Task<AuthResult> RegisterAsync(string email, string password, string name) => throw new NotImplementedException();
    public Task<AuthResult> LoginAsync(string email, string password) => throw new NotImplementedException();
    public Task<AuthResult> RefreshTokenAsync(string refreshToken) => throw new NotImplementedException();
    public Task<AuthResult> GoogleLoginAsync(string idToken) => throw new NotImplementedException();
    public Task<AuthResult> GitHubLoginAsync(string code) => throw new NotImplementedException();
}
