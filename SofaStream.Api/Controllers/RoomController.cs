using Microsoft.AspNetCore.Mvc;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Application.Rooms.Commands.CreateRoom;
using SofaStream.Domain.Entities;

namespace SofaStream.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RoomController(
    ICommandHandler<CreateRoomCommand, CreateRoomResult> createRoomHandler,
    ICommandHandler<ChangePlaybackStateCommand, bool> changePlaybackStateHandler) : ControllerBase
{
    
    /// <summary>
    /// Creates a new synchronized viewing room.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateRoom(
        [FromBody] CreateRoomRequest request,
        CancellationToken cancellationToken
    )
    {
        var command = new CreateRoomCommand(request.Name, request.HostId);
        var result = await createRoomHandler.HandleAsync(command, cancellationToken);
        
        return Ok(result);
    }

    /// <summary>
    /// Changes the playback state of the room (Play, Pause, Buffering).
    /// </summary>
    [HttpPost("{roomId:guid}/playback")]
    public async Task<IActionResult> ChangePlaybackState(
        [FromRoute] Guid roomId,
        [FromBody] ChangePlaybackStateRequest request,
        CancellationToken cancellationToken
    )
    {
        var command = new ChangePlaybackStateCommand(roomId, request.UserId, request.RequestedState, request.ClientPosition);
        var result = await changePlaybackStateHandler.HandleAsync(command, cancellationToken);

        if (!result)
        {
            return BadRequest("Failed to change playback state. Check if room exists, user is in the room, or if someone is buffering.");
        }
        
        return Ok("State changed successfully. SignalR broadcast triggered.");
    }
}

public record CreateRoomRequest(string Name, Guid HostId);
public record ChangePlaybackStateRequest(Guid UserId, PlaybackState RequestedState, TimeSpan ClientPosition);