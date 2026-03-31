using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using MindReader.Cloud.Application.Common.Interfaces;
using MindReader.Cloud.Domain.Common;
using MindReader.Cloud.Domain.Entities;
using MindReader.Cloud.Infrastructure.Identity;

namespace MindReader.Cloud.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ICloudDbContext _db;
    private readonly IConfiguration _config;

    public AuthService(UserManager<ApplicationUser> userManager, ICloudDbContext db, IConfiguration config)
    {
        _userManager = userManager;
        _db = db;
        _config = config;
    }

    public async Task<AuthResult> RegisterAsync(string email, string password, string name)
    {
        var existing = await _userManager.FindByEmailAsync(email);
        if (existing != null) return AuthResult.Failure("Email already registered");

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FullName = name,
            IsActive = true,
        };

        var result = await _userManager.CreateAsync(user, password);
        if (!result.Succeeded)
            return AuthResult.Failure(string.Join("; ", result.Errors.Select(e => e.Description)));

        // Auto-create tenant
        var tenant = new Tenant
        {
            UserId = user.Id,
            Neo4jTenantId = Guid.NewGuid().ToString(),
        };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        return await GenerateAuthResult(user, tenant);
    }

    public async Task<AuthResult> LoginAsync(string email, string password)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user == null || !user.IsActive) return AuthResult.Failure("Invalid credentials");

        var valid = await _userManager.CheckPasswordAsync(user, password);
        if (!valid) return AuthResult.Failure("Invalid credentials");

        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.UserId == user.Id);
        if (tenant == null) return AuthResult.Failure("No tenant found for user");

        return await GenerateAuthResult(user, tenant);
    }

    public async Task<AuthResult> RefreshTokenAsync(string refreshToken)
    {
        var user = await _userManager.Users.FirstOrDefaultAsync(u => u.RefreshToken == refreshToken);
        if (user == null || user.RefreshTokenExpiry < DateTimeOffset.UtcNow)
            return AuthResult.Failure("Invalid or expired refresh token");

        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.UserId == user.Id);
        if (tenant == null) return AuthResult.Failure("No tenant found");

        return await GenerateAuthResult(user, tenant);
    }

    public Task<AuthResult> GoogleLoginAsync(string idToken)
    {
        // TODO: Implement Google OAuth validation + user creation
        return Task.FromResult(AuthResult.Failure("Google OAuth not yet configured"));
    }

    public Task<AuthResult> GitHubLoginAsync(string code)
    {
        // TODO: Implement GitHub OAuth code exchange + user creation
        return Task.FromResult(AuthResult.Failure("GitHub OAuth not yet configured"));
    }

    private async Task<AuthResult> GenerateAuthResult(ApplicationUser user, Tenant tenant)
    {
        var token = GenerateJwt(user, tenant);
        var refreshToken = GenerateRefreshToken();

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiry = DateTimeOffset.UtcNow.AddDays(
            int.Parse(_config["Jwt:RefreshTokenExpiryDays"] ?? "7"));
        await _userManager.UpdateAsync(user);

        return AuthResult.Success(token, refreshToken, new AuthUserInfo
        {
            Id = user.Id,
            Email = user.Email!,
            Name = user.FullName,
            TenantId = tenant.Neo4jTenantId,
            Tier = tenant.Tier.ToString(),
        });
    }

    private string GenerateJwt(ApplicationUser user, Tenant tenant)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
            _config["Jwt:Key"] ?? throw new InvalidOperationException("JWT key not configured")));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
            new(ClaimTypes.Name, user.FullName),
            new("tenant_id", tenant.Neo4jTenantId),
            new("tier", tenant.Tier.ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(int.Parse(_config["Jwt:ExpiryMinutes"] ?? "60")),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateRefreshToken()
    {
        var bytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }
}
