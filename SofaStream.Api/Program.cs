using Microsoft.EntityFrameworkCore;
using SofaStream.Api.Hubs;
using SofaStream.Api.Services;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Application.Rooms.Commands.CreateRoom;
using SofaStream.Application.Rooms.EventHandlers;
using SofaStream.Domain.Common;
using SofaStream.Domain.Events;
using SofaStream.Infrastructure.Persistence;
using SofaStream.Infrastructure.Repositories;
using SofaStream.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseInMemoryDatabase("SofaStreamDb"));

builder.Services.AddScoped<IRoomRepository, RoomRepository>();
builder.Services.AddScoped<DomainEventDispatcher>();

builder.Services.AddSignalR();
builder.Services.AddTransient<IRoomNotificationService, SignalRRoomNotificationService>();

builder.Services.AddScoped<ICommandHandler<CreateRoomCommand, CreateRoomResult>, CreateRoomCommandHandler>();
builder.Services.AddScoped<ICommandHandler<ChangePlaybackStateCommand, bool>, ChangePlaybackStateCommandHandler>();
builder.Services.AddScoped<IDomainEventHandler<RoomPlaybackStateChangedEvent>, RoomPlaybackStateChangedEventHandler>();

builder.Services.AddControllers();

var app = builder.Build();

app.UseRouting();

app.MapControllers();
app.MapHub<RoomHub>("/hubs/room");

app.Run();