namespace MindReader.Cloud.Domain.Common;

public class AuthResult
{
    public bool IsSuccess { get; private set; }
    public string? Token { get; private set; }
    public string? RefreshToken { get; private set; }
    public string? Error { get; private set; }
    public AuthUserInfo? User { get; private set; }

    public static AuthResult Success(string token, string refreshToken, AuthUserInfo user) =>
        new() { IsSuccess = true, Token = token, RefreshToken = refreshToken, User = user };
    public static AuthResult Failure(string error) =>
        new() { IsSuccess = false, Error = error };
}

public class AuthUserInfo
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string Tier { get; set; } = "Free";
}
