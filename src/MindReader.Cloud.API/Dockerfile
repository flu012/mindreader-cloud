FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 5000

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/MindReader.Cloud.API/MindReader.Cloud.API.csproj", "src/MindReader.Cloud.API/"]
COPY ["src/MindReader.Cloud.Application/MindReader.Cloud.Application.csproj", "src/MindReader.Cloud.Application/"]
COPY ["src/MindReader.Cloud.Domain/MindReader.Cloud.Domain.csproj", "src/MindReader.Cloud.Domain/"]
COPY ["src/MindReader.Cloud.Infrastructure/MindReader.Cloud.Infrastructure.csproj", "src/MindReader.Cloud.Infrastructure/"]
RUN dotnet restore "src/MindReader.Cloud.API/MindReader.Cloud.API.csproj"
COPY . .
WORKDIR "/src/src/MindReader.Cloud.API"
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:5000
ENTRYPOINT ["dotnet", "MindReader.Cloud.API.dll"]
