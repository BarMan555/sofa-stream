using Microsoft.AspNetCore.Mvc;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Application.Rooms.Commands.ChangeVideo;
using SofaStream.Application.Rooms.Commands.CreateRoom;
using SofaStream.Application.Rooms.Commands.LeaveRoom;
using SofaStream.Application.Rooms.Queries.GetRoomState;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;

namespace SofaStream.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RoomController(
    ICommandHandler<CreateRoomCommand, Result<Guid>> createRoomHandler,
    ICommandHandler<ChangePlaybackStateCommand, Result> changePlaybackStateHandler,
    ICommandHandler<ChangeVideoCommand, Result> changeVideoHandler,
    IQueryHandler<GetRoomStateQuery, Result<RoomStateDto>> getRoomStateHandler) : ControllerBase
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
        
        return Ok(result.Value);
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
        var command = new ChangePlaybackStateCommand(
            roomId, 
            request.UserId, 
            request.RequestedState, 
            request.ClientPosition);
        
        var result = await changePlaybackStateHandler.HandleAsync(command, cancellationToken);

        if (result.IsFailure)
        {
            return BadRequest(result.Error);
        }
        
        return Ok("State changed successfully. SignalR broadcast triggered.");
    }

    [HttpGet("{roomId:guid}")]
    public async Task<IActionResult> GetRoomState(
        [FromRoute] Guid roomId,
        CancellationToken cancellationToken
    )
    {
        var query = new GetRoomStateQuery(roomId);
        var result = await getRoomStateHandler.HandleAsync(query, cancellationToken);
        
        if (result.IsFailure)
            return BadRequest(result.Error);
        
        return Ok(result.Value);
    }

    /// <summary>
    /// Changes the video content for the specified room. Only the room host can perform this action.
    /// </summary>
    [HttpPost("{roomId:guid}/video")]
    public async Task<IActionResult> ChangeVideo(
        [FromRoute] Guid roomId,
        [FromBody] ChangeVideoRequest request,
        CancellationToken cancellationToken)
    {
        var command = new ChangeVideoCommand(roomId, 
            request.UserId, 
            request.VideoUrl, 
            request.Title, 
            request.DurationSeconds);
        
        var result = await changeVideoHandler.HandleAsync(command, cancellationToken);
        if (result.IsFailure)
            return BadRequest(result.Error);
        
        return Ok("Video changed successfully. SignalR broadcast triggered.");
    }
}

public record CreateRoomRequest(string Name, Guid HostId);
public record ChangePlaybackStateRequest(Guid UserId, PlaybackState RequestedState, TimeSpan ClientPosition);
public record ChangeVideoRequest(Guid UserId, string VideoUrl, string Title, double DurationSeconds);