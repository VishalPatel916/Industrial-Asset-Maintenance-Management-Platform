# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props AuraOps.slnx ./
COPY src/AuraOps.Domain/AuraOps.Domain.csproj src/AuraOps.Domain/
COPY src/AuraOps.Application/AuraOps.Application.csproj src/AuraOps.Application/
COPY src/AuraOps.Infrastructure/AuraOps.Infrastructure.csproj src/AuraOps.Infrastructure/
COPY src/AuraOps.Api/AuraOps.Api.csproj src/AuraOps.Api/
RUN dotnet restore src/AuraOps.Api/AuraOps.Api.csproj
COPY src/ src/
RUN dotnet publish src/AuraOps.Api/AuraOps.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "AuraOps.Api.dll"]
