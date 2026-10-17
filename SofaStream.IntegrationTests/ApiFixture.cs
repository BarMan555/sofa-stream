using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SofaStream.Infrastructure.Persistence;
using Testcontainers.PostgreSql;
using System.Net.Http.Headers;
using SofaStream.Api.Infrastructure;

namespace SofaStream.IntegrationTests;

public sealed class ApiFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:16-alpine").Build();
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;
    public TestTimeProvider Clock { get; } = new();

    public async Task InitializeAsync()
    {
        try
        {
            await _database.StartAsync();
            Factory = new ApiFactory(_database.GetConnectionString(), Clock);
            Client = Factory.CreateClient();
        }
        catch
        {
            if (Factory is not null) await Factory.DisposeAsync();
            await _database.DisposeAsync();
            throw;
        }
    }

    public async Task DisposeAsync()
    {
        Client?.Dispose();
        if (Factory is not null) await Factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    public HttpClient ClientFor(Guid user)
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(user));
        return client;
    }

    private string Token(Guid user) => Factory.Services.GetRequiredService<ParticipantSession>().Issue(user).Token;

    public HubConnection CreateConnection(Guid? user = null) => new HubConnectionBuilder()
        .WithUrl("http://localhost/hubs/room", options =>
        {
            options.Transports = HttpTransportType.LongPolling;
            options.HttpMessageHandlerFactory = _ => Factory.Server.CreateHandler();
            if (user is not null) options.AccessTokenProvider = () => Task.FromResult<string?>(Token(user.Value));
        })
        .Build();

    private sealed class ApiFactory(string connectionString, TimeProvider clock) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<ApplicationDbContext>();
                services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(connectionString));
                services.RemoveAll<TimeProvider>();
                services.AddSingleton(clock);
            });
        }
    }
}

public sealed class TestTimeProvider : TimeProvider
{
    public DateTimeOffset? FixedUtcNow { get; set; }
    public override DateTimeOffset GetUtcNow() => FixedUtcNow ?? DateTimeOffset.UtcNow;
}

[CollectionDefinition("PostgreSQL API")]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>;
