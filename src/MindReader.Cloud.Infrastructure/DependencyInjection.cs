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
