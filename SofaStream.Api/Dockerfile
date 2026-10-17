# 1. Этап сборки (Build)
FROM mcr.microsoft.com/dotnet/sdk:10.0.102 AS build
WORKDIR /src

# Копируем файлы проектов для кэширования зависимостей
COPY ["global.json", "Directory.Build.props", "./"]
COPY ["SofaStream.Api/SofaStream.Api.csproj", "SofaStream.Api/"]
COPY ["SofaStream.Api/packages.lock.json", "SofaStream.Api/"]
COPY ["SofaStream.Application/SofaStream.Application.csproj", "SofaStream.Application/"]
COPY ["SofaStream.Application/packages.lock.json", "SofaStream.Application/"]
COPY ["SofaStream.Domain/SofaStream.Domain.csproj", "SofaStream.Domain/"]
COPY ["SofaStream.Domain/packages.lock.json", "SofaStream.Domain/"]
COPY ["SofaStream.Infrastructure/SofaStream.Infrastructure.csproj", "SofaStream.Infrastructure/"]
COPY ["SofaStream.Infrastructure/packages.lock.json", "SofaStream.Infrastructure/"]
RUN dotnet restore "SofaStream.Api/SofaStream.Api.csproj" --locked-mode

# Копируем весь остальной код и собираем релиз
COPY . .
WORKDIR "/src/SofaStream.Api"
RUN dotnet publish "SofaStream.Api.csproj" -c Release --no-restore -o /app/publish /p:UseAppHost=false

# 2. Этап выполнения (Run)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5063
EXPOSE 5063

ENTRYPOINT ["dotnet", "SofaStream.Api.dll"]
