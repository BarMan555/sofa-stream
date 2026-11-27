# 1. Этап сборки (Build)
FROM mcr.microsoft.com/dotnet/sdk:10.0.102 AS build
WORKDIR /workspace

# Копируем файлы проектов для кэширования зависимостей
COPY ["global.json", "Directory.Build.props", "./"]
COPY ["src/SofaStream.Api/SofaStream.Api.csproj", "src/SofaStream.Api/"]
COPY ["src/SofaStream.Api/packages.lock.json", "src/SofaStream.Api/"]
COPY ["src/SofaStream.Application/SofaStream.Application.csproj", "src/SofaStream.Application/"]
COPY ["src/SofaStream.Application/packages.lock.json", "src/SofaStream.Application/"]
COPY ["src/SofaStream.Domain/SofaStream.Domain.csproj", "src/SofaStream.Domain/"]
COPY ["src/SofaStream.Domain/packages.lock.json", "src/SofaStream.Domain/"]
COPY ["src/SofaStream.Infrastructure/SofaStream.Infrastructure.csproj", "src/SofaStream.Infrastructure/"]
COPY ["src/SofaStream.Infrastructure/packages.lock.json", "src/SofaStream.Infrastructure/"]
RUN dotnet restore "src/SofaStream.Api/SofaStream.Api.csproj" --locked-mode

# Копируем весь остальной код и собираем релиз
COPY src/ src/
WORKDIR /workspace/src/SofaStream.Api
RUN dotnet publish "SofaStream.Api.csproj" -c Release --no-restore -o /app/publish /p:UseAppHost=false

# 2. Этап выполнения (Run)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5063
EXPOSE 5063

ENTRYPOINT ["dotnet", "SofaStream.Api.dll"]
