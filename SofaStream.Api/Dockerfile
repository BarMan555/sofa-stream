# 1. Этап сборки (Build)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Копируем файлы проектов для кэширования зависимостей
COPY ["SofaStream.Api/SofaStream.Api.csproj", "SofaStream.Api/"]
COPY ["SofaStream.Application/SofaStream.Application.csproj", "SofaStream.Application/"]
COPY ["SofaStream.Domain/SofaStream.Domain.csproj", "SofaStream.Domain/"]
COPY ["SofaStream.Infrastructure/SofaStream.Infrastructure.csproj", "SofaStream.Infrastructure/"]
RUN dotnet restore "SofaStream.Api/SofaStream.Api.csproj"

# Копируем весь остальной код и собираем релиз
COPY . .
WORKDIR "/src/SofaStream.Api"
RUN dotnet publish "SofaStream.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# 2. Этап выполнения (Run)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5063
EXPOSE 5063

ENTRYPOINT ["dotnet", "SofaStream.Api.dll"]