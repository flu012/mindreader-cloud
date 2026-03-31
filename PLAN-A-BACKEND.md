# MindReader Cloud — Plan A: .NET 8 Backend API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the .NET 8 Web API backend for MindReader Cloud — auth, tenant management, usage limits, and proxy to MindReader Express.

**Architecture:** Clean Architecture following ChippyV2 patterns (MediatR + CQRS + EF Core). .NET API handles all user-facing operations. Graph operations proxied to MindReader Express (internal service) with X-Tenant-Id + X-Internal-Secret headers. SQL Server for users/tenants/billing. JWT + OAuth for auth.

**Tech Stack:** .NET 8, SQL Server, EF Core, MediatR, FluentValidation, JWT Bearer, Google/GitHub OAuth, HttpClient for proxy

**Repo:** `/mnt/e/project/mindreader-cloud/`

---

## Scope: Plan A (Backend Only)

This plan covers:
1. Project scaffold (solution + 4 layer projects)
2. Domain entities (User, Tenant, UsageLog, ApiKey, OAuthProvider)
3. Infrastructure (DbContext, EF Core, Identity, migrations)
4. Auth (register, login, JWT, refresh tokens, Google OAuth, GitHub OAuth)
5. Tenant management (auto-create on register, CRUD)
6. Graph proxy (forward /api/graph/* to Express with tenant headers)
7. Usage limits (track + enforce free tier)
8. Integration tests

**NOT in this plan:** React SPA (Plan B), Docker Compose (Plan C), onboarding playground (Plan B).

---

## File Structure

```
mindreader-cloud/
├── src/
│   ├── MindReader.Cloud.API/
│   │   ├── Controllers/
│   │   │   ├── ApiControllerBase.cs
│   │   │   ├── AuthController.cs
│   │   │   ├── UserController.cs
│   │   │   ├── TenantController.cs
│   │   │   └── GraphProxyController.cs
│   │   ├── Middleware/
│   │   │   └── ExceptionHandlingMiddleware.cs
│   │   ├── Program.cs
│   │   ├── appsettings.json
│   │   └── MindReader.Cloud.API.csproj
│   │
│   ├── MindReader.Cloud.Application/
│   │   ├── Common/
│   │   │   ├── Behaviours/
│   │   │   │   └── ValidationBehaviour.cs
│   │   │   ├── Exceptions/
│   │   │   │   ├── NotFoundException.cs
│   │   │   │   └── ForbiddenAccessException.cs
│   │   │   └── Interfaces/
│   │   │       ├── ICloudDbContext.cs
│   │   │       ├── IAuthService.cs
│   │   │       ├── ITenantService.cs
│   │   │       ├── IUsageLimitService.cs
│   │   │       └── IGraphProxyService.cs
│   │   ├── DTOs/
│   │   │   ├── Auth/
│   │   │   │   ├── LoginRequest.cs
│   │   │   │   ├── RegisterRequest.cs
│   │   │   │   ├── LoginResponse.cs
│   │   │   │   └── AuthUserInfo.cs
│   │   │   ├── Tenant/
│   │   │   │   └── TenantDto.cs
│   │   │   └── Usage/
│   │   │       └── UsageDto.cs
│   │   ├── Features/
│   │   │   ├── Auth/
│   │   │   │   ├── Commands/
│   │   │   │   │   ├── RegisterCommand.cs
│   │   │   │   │   ├── LoginCommand.cs
│   │   │   │   │   ├── RefreshTokenCommand.cs
│   │   │   │   │   ├── GoogleLoginCommand.cs
│   │   │   │   │   └── GitHubLoginCommand.cs
│   │   │   │   └── Queries/
│   │   │   │       └── GetCurrentUserQuery.cs
│   │   │   ├── Tenants/
│   │   │   │   ├── Commands/
│   │   │   │   │   └── UpdateTenantSettingsCommand.cs
│   │   │   │   └── Queries/
│   │   │   │       ├── GetTenantQuery.cs
│   │   │   │       └── GetUsageQuery.cs
│   │   │   └── Graph/
│   │   │       └── Commands/
│   │   │           └── ProxyGraphRequestCommand.cs
│   │   ├── Validators/
│   │   │   ├── Auth/
│   │   │   │   ├── RegisterCommandValidator.cs
│   │   │   │   └── LoginCommandValidator.cs
│   │   │   └── Tenant/
│   │   │       └── UpdateTenantSettingsValidator.cs
│   │   └── DependencyInjection.cs
│   │
│   ├── MindReader.Cloud.Domain/
│   │   ├── Entities/
│   │   │   ├── Tenant.cs
│   │   │   ├── UsageLog.cs
│   │   │   ├── ApiKey.cs
│   │   │   └── OAuthProvider.cs
│   │   ├── Enums/
│   │   │   ├── TierType.cs
│   │   │   └── OperationType.cs
│   │   ├── Common/
│   │   │   ├── Result.cs
│   │   │   ├── AuthResult.cs
│   │   │   └── BaseEntity.cs
│   │   └── MindReader.Cloud.Domain.csproj
│   │
│   └── MindReader.Cloud.Infrastructure/
│       ├── Data/
│       │   ├── CloudDbContext.cs
│       │   ├── Configurations/
│       │   │   ├── TenantConfiguration.cs
│       │   │   ├── UsageLogConfiguration.cs
│       │   │   ├── ApiKeyConfiguration.cs
│       │   │   └── OAuthProviderConfiguration.cs
│       │   └── Migrations/
│       ├── Identity/
│       │   └── ApplicationUser.cs
│       ├── Services/
│       │   ├── AuthService.cs
│       │   ├── TenantService.cs
│       │   ├── UsageLimitService.cs
│       │   └── GraphProxyService.cs
│       ├── DependencyInjection.cs
│       └── MindReader.Cloud.Infrastructure.csproj
│
├── tests/
│   └── MindReader.Cloud.Tests/
│       ├── Auth/
│       │   ├── RegisterTests.cs
│       │   ├── LoginTests.cs
│       │   └── OAuthTests.cs
│       ├── Tenants/
│       │   ├── TenantIsolationTests.cs
│       │   └── UsageLimitTests.cs
│       ├── Proxy/
│       │   └── GraphProxyTests.cs
│       └── MindReader.Cloud.Tests.csproj
│
├── MindReader.Cloud.sln
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

### Task 1: Scaffold Solution + Projects

- [ ] **Step 1: Create solution and projects**

```bash
mkdir -p /mnt/e/project/mindreader-cloud && cd /mnt/e/project/mindreader-cloud
dotnet new sln -n MindReader.Cloud

# API project
dotnet new webapi -n MindReader.Cloud.API -o src/MindReader.Cloud.API --no-openapi
dotnet sln add src/MindReader.Cloud.API

# Application layer
dotnet new classlib -n MindReader.Cloud.Application -o src/MindReader.Cloud.Application
dotnet sln add src/MindReader.Cloud.Application

# Domain layer
dotnet new classlib -n MindReader.Cloud.Domain -o src/MindReader.Cloud.Domain
dotnet sln add src/MindReader.Cloud.Domain

# Infrastructure layer
dotnet new classlib -n MindReader.Cloud.Infrastructure -o src/MindReader.Cloud.Infrastructure
dotnet sln add src/MindReader.Cloud.Infrastructure

# Test project
dotnet new xunit -n MindReader.Cloud.Tests -o tests/MindReader.Cloud.Tests
dotnet sln add tests/MindReader.Cloud.Tests
```

- [ ] **Step 2: Add project references**

```bash
cd /mnt/e/project/mindreader-cloud

# API depends on Application + Infrastructure
dotnet add src/MindReader.Cloud.API reference src/MindReader.Cloud.Application
dotnet add src/MindReader.Cloud.API reference src/MindReader.Cloud.Infrastructure

# Application depends on Domain
dotnet add src/MindReader.Cloud.Application reference src/MindReader.Cloud.Domain

# Infrastructure depends on Application + Domain
dotnet add src/MindReader.Cloud.Infrastructure reference src/MindReader.Cloud.Application
dotnet add src/MindReader.Cloud.Infrastructure reference src/MindReader.Cloud.Domain

# Tests depend on all
dotnet add tests/MindReader.Cloud.Tests reference src/MindReader.Cloud.API
dotnet add tests/MindReader.Cloud.Tests reference src/MindReader.Cloud.Application
dotnet add tests/MindReader.Cloud.Tests reference src/MindReader.Cloud.Infrastructure
```

- [ ] **Step 3: Add NuGet packages**

```bash
# Application
dotnet add src/MindReader.Cloud.Application package MediatR --version 12.4.1
dotnet add src/MindReader.Cloud.Application package FluentValidation.DependencyInjectionExtensions --version 11.11.0

# Infrastructure
dotnet add src/MindReader.Cloud.Infrastructure package Microsoft.EntityFrameworkCore.SqlServer --version 8.0.11
dotnet add src/MindReader.Cloud.Infrastructure package Microsoft.AspNetCore.Identity.EntityFrameworkCore --version 8.0.11
dotnet add src/MindReader.Cloud.Infrastructure package Microsoft.EntityFrameworkCore.Tools --version 8.0.11

# API
dotnet add src/MindReader.Cloud.API package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.11
dotnet add src/MindReader.Cloud.API package Microsoft.AspNetCore.Authentication.Google --version 8.0.11
dotnet add src/MindReader.Cloud.API package Swashbuckle.AspNetCore --version 6.9.0
dotnet add src/MindReader.Cloud.API package Asp.Versioning.Mvc.ApiExplorer --version 8.1.0
dotnet add src/MindReader.Cloud.API package Serilog.AspNetCore --version 8.0.3

# Tests
dotnet add tests/MindReader.Cloud.Tests package Microsoft.AspNetCore.Mvc.Testing --version 8.0.11
dotnet add tests/MindReader.Cloud.Tests package Microsoft.EntityFrameworkCore.InMemory --version 8.0.11
dotnet add tests/MindReader.Cloud.Tests package Moq --version 4.20.72
```

- [ ] **Step 4: Initialize git**

```bash
cd /mnt/e/project/mindreader-cloud
git init && git branch -m main
cat > .gitignore << 'EOF'
bin/
obj/
.vs/
*.user
appsettings.Development.json
.env
EOF
git add -A && git commit -m "feat: scaffold solution with 4-layer architecture"
```

---

### Task 2: Domain Layer — Entities + Enums

**Files:**
- Create: `src/MindReader.Cloud.Domain/Entities/Tenant.cs`
- Create: `src/MindReader.Cloud.Domain/Entities/UsageLog.cs`
- Create: `src/MindReader.Cloud.Domain/Entities/ApiKey.cs`
- Create: `src/MindReader.Cloud.Domain/Entities/OAuthProvider.cs`
- Create: `src/MindReader.Cloud.Domain/Enums/TierType.cs`
- Create: `src/MindReader.Cloud.Domain/Enums/OperationType.cs`
- Create: `src/MindReader.Cloud.Domain/Common/Result.cs`
- Create: `src/MindReader.Cloud.Domain/Common/AuthResult.cs`
- Create: `src/MindReader.Cloud.Domain/Common/BaseEntity.cs`

- [ ] **Step 1: Create all domain files**

BaseEntity.cs:
```csharp
namespace MindReader.Cloud.Domain.Common;

public abstract class BaseEntity
{
    public int Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
```

TierType.cs:
```csharp
namespace MindReader.Cloud.Domain.Enums;

public enum TierType
{
    Free = 0,
    Basic = 1,
    Pro = 2
}
```

OperationType.cs:
```csharp
namespace MindReader.Cloud.Domain.Enums;

public enum OperationType
{
    EntityCreate = 0,
    EntityUpdate = 1,
    RelationshipCreate = 2,
    Evolve = 3,
    Search = 4,
    Recall = 5,
    Store = 6
}
```

Tenant.cs:
```csharp
namespace MindReader.Cloud.Domain.Entities;

using MindReader.Cloud.Domain.Common;
using MindReader.Cloud.Domain.Enums;

public class Tenant : BaseEntity
{
    public int UserId { get; set; }
    public string Neo4jTenantId { get; set; } = Guid.NewGuid().ToString();
    public TierType Tier { get; set; } = TierType.Free;
    public bool IsActive { get; set; } = true;
}
```

UsageLog.cs:
```csharp
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
```

ApiKey.cs:
```csharp
namespace MindReader.Cloud.Domain.Entities;

using MindReader.Cloud.Domain.Common;

public class ApiKey : BaseEntity
{
    public int TenantId { get; set; }
    public string Provider { get; set; } = string.Empty; // openai, anthropic, dashscope, ollama
    public string EncryptedKey { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
```

OAuthProvider.cs:
```csharp
namespace MindReader.Cloud.Domain.Entities;

using MindReader.Cloud.Domain.Common;

public class OAuthProvider : BaseEntity
{
    public int UserId { get; set; }
    public string Provider { get; set; } = string.Empty; // google, github
    public string ExternalId { get; set; } = string.Empty;
    public string? Email { get; set; }
}
```

Result.cs:
```csharp
namespace MindReader.Cloud.Domain.Common;

public class Result<T>
{
    public bool IsSuccess { get; private set; }
    public T? Value { get; private set; }
    public string? Error { get; private set; }

    public static Result<T> Success(T value) => new() { IsSuccess = true, Value = value };
    public static Result<T> Failure(string error) => new() { IsSuccess = false, Error = error };
}
```

AuthResult.cs:
```csharp
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
```

- [ ] **Step 2: Verify build**

```bash
cd /mnt/e/project/mindreader-cloud && dotnet build
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add domain entities, enums, and result types"
```

---

### Task 3: Infrastructure — DbContext + Identity + EF Configuration

This task sets up EF Core, Identity, and the SQL Server connection.

- [ ] **Step 1: Create ApplicationUser**

`src/MindReader.Cloud.Infrastructure/Identity/ApplicationUser.cs`:
```csharp
using Microsoft.AspNetCore.Identity;

namespace MindReader.Cloud.Infrastructure.Identity;

public class ApplicationUser : IdentityUser<int>
{
    public string FullName { get; set; } = string.Empty;
    public string? RefreshToken { get; set; }
    public DateTimeOffset? RefreshTokenExpiry { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
```

- [ ] **Step 2: Create ICloudDbContext interface**

`src/MindReader.Cloud.Application/Common/Interfaces/ICloudDbContext.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using MindReader.Cloud.Domain.Entities;

namespace MindReader.Cloud.Application.Common.Interfaces;

public interface ICloudDbContext
{
    DbSet<Tenant> Tenants { get; }
    DbSet<UsageLog> UsageLogs { get; }
    DbSet<ApiKey> ApiKeys { get; }
    DbSet<OAuthProvider> OAuthProviders { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
```

- [ ] **Step 3: Create CloudDbContext**

`src/MindReader.Cloud.Infrastructure/Data/CloudDbContext.cs`:
```csharp
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using MindReader.Cloud.Application.Common.Interfaces;
using MindReader.Cloud.Domain.Entities;
using MindReader.Cloud.Infrastructure.Identity;

namespace MindReader.Cloud.Infrastructure.Data;

public class CloudDbContext : IdentityDbContext<ApplicationUser, IdentityRole<int>, int>, ICloudDbContext
{
    public CloudDbContext(DbContextOptions<CloudDbContext> options) : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<UsageLog> UsageLogs => Set<UsageLog>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<OAuthProvider> OAuthProviders => Set<OAuthProvider>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(CloudDbContext).Assembly);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Added)
            {
                var createdAt = entry.Entity.GetType().GetProperty("CreatedAt");
                if (createdAt?.PropertyType == typeof(DateTimeOffset))
                {
                    var current = (DateTimeOffset)createdAt.GetValue(entry.Entity)!;
                    if (current == default) createdAt.SetValue(entry.Entity, DateTimeOffset.UtcNow);
                }
            }
        }
        return await base.SaveChangesAsync(cancellationToken);
    }
}
```

- [ ] **Step 4: Create EF configurations**

`src/MindReader.Cloud.Infrastructure/Data/Configurations/TenantConfiguration.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MindReader.Cloud.Domain.Entities;

namespace MindReader.Cloud.Infrastructure.Data.Configurations;

public class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.HasIndex(t => t.UserId).IsUnique();
        builder.HasIndex(t => t.Neo4jTenantId).IsUnique();
        builder.Property(t => t.Neo4jTenantId).HasMaxLength(100).IsRequired();
    }
}

public class UsageLogConfiguration : IEntityTypeConfiguration<UsageLog>
{
    public void Configure(EntityTypeBuilder<UsageLog> builder)
    {
        builder.HasIndex(u => new { u.TenantId, u.Date, u.Operation });
    }
}

public class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.HasIndex(a => new { a.TenantId, a.Provider }).IsUnique();
        builder.Property(a => a.Provider).HasMaxLength(50).IsRequired();
        builder.Property(a => a.EncryptedKey).HasMaxLength(500).IsRequired();
    }
}

public class OAuthProviderConfiguration : IEntityTypeConfiguration<OAuthProvider>
{
    public void Configure(EntityTypeBuilder<OAuthProvider> builder)
    {
        builder.HasIndex(o => new { o.Provider, o.ExternalId }).IsUnique();
        builder.Property(o => o.Provider).HasMaxLength(50).IsRequired();
        builder.Property(o => o.ExternalId).HasMaxLength(200).IsRequired();
    }
}
```

- [ ] **Step 5: Create DependencyInjection.cs for Infrastructure**

`src/MindReader.Cloud.Infrastructure/DependencyInjection.cs`:
```csharp
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MindReader.Cloud.Application.Common.Interfaces;
using MindReader.Cloud.Infrastructure.Data;
using MindReader.Cloud.Infrastructure.Identity;
using MindReader.Cloud.Infrastructure.Services;

namespace MindReader.Cloud.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<CloudDbContext>(options =>
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                b => b.MigrationsAssembly(typeof(CloudDbContext).Assembly.FullName)));

        services.AddIdentity<ApplicationUser, IdentityRole<int>>(options =>
        {
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequiredLength = 8;
            options.User.RequireUniqueEmail = true;
        })
        .AddEntityFrameworkStores<CloudDbContext>()
        .AddDefaultTokenProviders();

        services.AddScoped<ICloudDbContext>(provider => provider.GetRequiredService<CloudDbContext>());
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<ITenantService, TenantService>();
        services.AddScoped<IUsageLimitService, UsageLimitService>();
        services.AddHttpClient<IGraphProxyService, GraphProxyService>();

        return services;
    }
}
```

- [ ] **Step 6: Create DependencyInjection.cs for Application**

`src/MindReader.Cloud.Application/DependencyInjection.cs`:
```csharp
using System.Reflection;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

namespace MindReader.Cloud.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));
        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());
        return services;
    }
}
```

- [ ] **Step 7: Verify build**

```bash
cd /mnt/e/project/mindreader-cloud && dotnet build
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add infrastructure layer — DbContext, Identity, EF configurations"
```

---

### Task 4: Service Interfaces + Stubs

Create the service interfaces in Application and stub implementations in Infrastructure.

- [ ] **Step 1: Create service interfaces**

`src/MindReader.Cloud.Application/Common/Interfaces/IAuthService.cs`:
```csharp
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
```

`src/MindReader.Cloud.Application/Common/Interfaces/ITenantService.cs`:
```csharp
namespace MindReader.Cloud.Application.Common.Interfaces;

public interface ITenantService
{
    int CurrentUserId { get; }
    string CurrentTenantId { get; }
    string CurrentTier { get; }
}
```

`src/MindReader.Cloud.Application/Common/Interfaces/IUsageLimitService.cs`:
```csharp
using MindReader.Cloud.Domain.Enums;

namespace MindReader.Cloud.Application.Common.Interfaces;

public interface IUsageLimitService
{
    Task<bool> CanPerformAsync(int tenantId, OperationType operation);
    Task RecordUsageAsync(int tenantId, OperationType operation, int count = 1);
    Task<UsageSummary> GetUsageSummaryAsync(int tenantId);
}

public class UsageSummary
{
    public int EntityCount { get; set; }
    public int RelationshipCount { get; set; }
    public int EvolvesToday { get; set; }
    public int MaxEntities { get; set; }
    public int MaxRelationships { get; set; }
    public int MaxEvolvesPerDay { get; set; }
}
```

`src/MindReader.Cloud.Application/Common/Interfaces/IGraphProxyService.cs`:
```csharp
namespace MindReader.Cloud.Application.Common.Interfaces;

public interface IGraphProxyService
{
    Task<HttpResponseMessage> ForwardAsync(string path, HttpMethod method, string? body, string tenantId);
}
```

- [ ] **Step 2: Create stub services in Infrastructure**

Create stub files for AuthService.cs, TenantService.cs, UsageLimitService.cs, GraphProxyService.cs in `src/MindReader.Cloud.Infrastructure/Services/`. Each should implement the interface with `throw new NotImplementedException()` for now — they'll be fleshed out in later tasks.

- [ ] **Step 3: Verify build**

```bash
dotnet build
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add service interfaces and stub implementations"
```

---

### Task 5: Program.cs + API Controller Base + Auth Controller

- [ ] **Step 1: Create ApiControllerBase**

`src/MindReader.Cloud.API/Controllers/ApiControllerBase.cs`:
```csharp
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace MindReader.Cloud.API.Controllers;

[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
public abstract class ApiControllerBase : ControllerBase
{
    private ISender? _mediator;
    protected ISender Mediator => _mediator ??= HttpContext.RequestServices.GetRequiredService<ISender>();
}
```

- [ ] **Step 2: Create ExceptionHandlingMiddleware**

`src/MindReader.Cloud.API/Middleware/ExceptionHandlingMiddleware.cs`:
(Same pattern as ChippyV2 — catches ValidationException, NotFoundException, ForbiddenAccessException, returns ProblemDetails)

- [ ] **Step 3: Create Program.cs**

Full pipeline: AddApplication(), AddInfrastructure(), JWT auth, CORS, Swagger, middleware ordering.

- [ ] **Step 4: Create appsettings.json**

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=MindReaderCloud;User Id=sa;Password=YourPassword;TrustServerCertificate=True"
  },
  "Jwt": {
    "Key": "MindReaderCloud-SuperSecret-JWT-Key-2026-Must-Be-At-Least-32-Chars!",
    "Issuer": "MindReaderCloud",
    "Audience": "MindReaderCloudApp",
    "ExpiryMinutes": 60,
    "RefreshTokenExpiryDays": 7
  },
  "MindReader": {
    "ExpressUrl": "http://localhost:18900",
    "InternalSecret": "mindreader-cloud-internal-secret-2026"
  },
  "UsageLimits": {
    "Free": { "MaxEntities": 100, "MaxRelationships": 500, "MaxEvolvesPerDay": 5 },
    "Basic": { "MaxEntities": 1000, "MaxRelationships": 5000, "MaxEvolvesPerDay": 50 },
    "Pro": { "MaxEntities": -1, "MaxRelationships": -1, "MaxEvolvesPerDay": -1 }
  },
  "Google": { "ClientId": "", "ClientSecret": "" },
  "GitHub": { "ClientId": "", "ClientSecret": "" }
}
```

- [ ] **Step 5: Create AuthController**

Endpoints: POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/google, POST /auth/github, GET /auth/me

- [ ] **Step 6: Verify server starts**

```bash
cd src/MindReader.Cloud.API && dotnet run
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add API layer — Program.cs, auth controller, middleware"
```

---

### Tasks 6-12: (Remaining implementation tasks)

6. **AuthService implementation** — register (creates user + tenant), login (JWT + refresh), OAuth
7. **TenantService implementation** — reads claims from JWT, resolves tenant
8. **GraphProxyService implementation** — HttpClient forwards to Express with X-Tenant-Id + X-Internal-Secret
9. **GraphProxyController** — catch-all route that proxies /api/graph/* to Express
10. **UsageLimitService** — checks entity/relationship counts via proxy, tracks evolves in SQL
11. **Integration tests** — register, login, tenant isolation, proxy, usage limits
12. **EF Migration + Docker Compose draft**

---

## Test Plan

### Unit Tests

| Test | What it validates |
|---|---|
| `RegisterTests.Register_CreatesUserAndTenant` | Registration creates ApplicationUser + Tenant with unique Neo4jTenantId |
| `RegisterTests.Register_DuplicateEmail_Fails` | Cannot register with existing email |
| `LoginTests.Login_ValidCredentials_ReturnsJwt` | Login returns JWT with correct claims (userId, tenantId, tier) |
| `LoginTests.Login_InvalidPassword_Returns401` | Wrong password returns Unauthorized |
| `LoginTests.RefreshToken_Valid_ReturnsNewJwt` | Refresh token generates new JWT |
| `LoginTests.RefreshToken_Expired_Returns401` | Expired refresh token fails |

### Integration Tests

| Test | What it validates |
|---|---|
| `TenantIsolationTests.UserA_CannotSee_UserB_Entities` | Graph proxy scopes data by tenant |
| `TenantIsolationTests.TenantId_Matches_NeoTenantId` | JWT tenantId claim matches Neo4j filter |
| `UsageLimitTests.FreeUser_CannotExceed_100_Entities` | Proxy returns 429 when entity limit reached |
| `UsageLimitTests.FreeUser_CannotExceed_5_Evolves` | Evolve endpoint returns 429 after 5/day |
| `UsageLimitTests.PaidUser_NoLimits` | Pro tier has no limits (-1) |
| `GraphProxyTests.Proxy_ForwardsHeaders_Correctly` | X-Tenant-Id and X-Internal-Secret are set |
| `GraphProxyTests.Proxy_Returns_ExpressResponse` | Response from Express is passed through |
| `OAuthTests.Google_Login_CreatesUser` | Google OAuth creates user + tenant |
| `OAuthTests.GitHub_Login_CreatesUser` | GitHub OAuth creates user + tenant |

### End-to-End Tests (after Docker Compose)

| Test | What it validates |
|---|---|
| Register → Login → Create Entity → Search → Verify | Full flow works |
| Register User A → Register User B → Create entity as A → Search as B → Verify empty | Tenant isolation end-to-end |
| Register → Evolve 5 times → 6th evolve → Verify 429 | Usage limits enforced |
| Register → Login → Update settings → Verify | Settings persistence |
