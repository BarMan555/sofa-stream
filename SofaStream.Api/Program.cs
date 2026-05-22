using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using SofaStream.Api.Hubs;
using SofaStream.Api.Services;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Application.Rooms.Commands.ChangeVideo;
using SofaStream.Application.Rooms.Commands.CreateRoom;
using SofaStream.Application.Rooms.Commands.JoinRoom;
using SofaStream.Application.Rooms.Commands.LeaveRoom;
using SofaStream.Application.Rooms.EventHandlers;
using SofaStream.Application.Rooms.Queries.GetRoomState;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Events;
using SofaStream.Infrastructure.Persistence;
using SofaStream.Infrastructure.Queries;
using SofaStream.Infrastructure.Repositories;
using SofaStream.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "SofaStream API", Version = "v1" });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddScoped<IRoomRepository, RoomRepository>();
builder.Services.AddScoped<DomainEventDispatcher>();

// Настройка CORS под динамический appsettings
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() 
                             ?? new[] { "http://localhost:8000", "http://127.0.0.1:8000" };

        policy.WithOrigins(allowedOrigins) 
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials(); 
    });
});

builder.Services.AddSignalR();
builder.Services.AddTransient<IRoomNotificationService, SignalRRoomNotificationService>();

builder.Services.AddScoped<ICommandHandler<CreateRoomCommand, Result<Guid>>, CreateRoomCommandHandler>();
builder.Services.AddScoped<ICommandHandler<ChangePlaybackStateCommand, Result>, ChangePlaybackStateCommandHandler>();
builder.Services.AddScoped<ICommandHandler<JoinRoomCommand, Result>, JoinRoomCommandHandler>();
builder.Services.AddScoped<ICommandHandler<LeaveRoomCommand, Result>, LeaveRoomCommandHandler>();
builder.Services.AddScoped<ICommandHandler<ChangeVideoCommand, Result>, ChangeVideoCommandHandler>();
builder.Services.AddScoped<IDomainEventHandler<RoomPlaybackStateChangedEvent>, RoomPlaybackStateChangedEventHandler>();
builder.Services.AddScoped<IDomainEventHandler<RoomVideoChangedEvent>, RoomVideoChangedEventHandler>();
builder.Services.AddScoped<IQueryHandler<GetRoomStateQuery, Result<RoomStateDto>>, GetRoomStateQueryHandler>();

builder.Services.AddExceptionHandler<SofaStream.Api.Infrastructure.GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddControllers();

var app = builder.Build();

// Настройка прокси-заголовков для работы за Nginx (Строго в самом верху!)
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

// Автоматическое применение миграций при старте контейнера бэкенда
using (var scope = app.Services.CreateScope())
{
    try
    {
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        context.Database.Migrate();
        Console.WriteLine("Database migrations applied successfully.");
    }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred while migrating the database.");
    }
}

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "SofaStream API V1");
        c.RoutePrefix = string.Empty; 
    });
}

app.UseRouting();
app.UseCors();
app.MapControllers();
app.MapHub<RoomHub>("/hubs/room");

app.Run();