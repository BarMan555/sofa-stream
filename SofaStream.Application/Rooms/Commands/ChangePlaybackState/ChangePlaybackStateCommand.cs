using MediatR;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.ChangePlaybackState;

public record ChangePlaybackStateCommand(
    Guid RoomId, 
    Guid UserId, // кто именно нажал кнопку
    PlaybackState RequestedState, 
    TimeSpan ClientPosition) : IRequest<bool>;