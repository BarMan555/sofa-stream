using Microsoft.EntityFrameworkCore;
using SofaStream.Api.Hubs;
using SofaStream.Api.Services;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Application.Rooms.Commands.CreateRoom;
using SofaStream.Application.Rooms.EventHandlers;
using SofaStream.Domain.Common;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Events;
using SofaStream.Infrastructure.Persistence;
using SofaStream.Infrastructure.Repositories;
using SofaStream.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "SofaStream API", Version = "v1" });
});

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseInMemoryDatabase("SofaStreamDb"));

builder.Services.AddScoped<IRoomRepository, RoomRepository>();
builder.Services.AddScoped<DomainEventDispatcher>();

builder.Services.AddSignalR();
builder.Services.AddTransient<IRoomNotificationService, SignalRRoomNotificationService>();

builder.Services.AddScoped<ICommandHandler<CreateRoomCommand, Result<Guid>>, CreateRoomCommandHandler>();
builder.Services.AddScoped<ICommandHandler<ChangePlaybackStateCommand, Result>, ChangePlaybackStateCommandHandler>();
builder.Services.AddScoped<IDomainEventHandler<RoomPlaybackStateChangedEvent>, RoomPlaybackStateChangedEventHandler>();

builder.Services.AddControllers();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "SofaStream API V1");
        // Чтобы Swagger открывался сразу по адресу http://localhost:PORT/
        c.RoutePrefix = string.Empty; 
    });
}

app.UseStaticFiles();

app.UseRouting();

app.MapControllers();
app.MapHub<RoomHub>("/hubs/room");

app.Run();