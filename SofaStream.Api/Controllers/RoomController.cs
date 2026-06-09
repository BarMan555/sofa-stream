using Microsoft.AspNetCore.Mvc;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Commands.ChangePlaybackState;
using SofaStream.Application.Rooms.Commands.ChangeVideo;
using SofaStream.Application.Rooms.Commands.CreateRoom;
using SofaStream.Application.Rooms.Commands.JoinRoom;
using SofaStream.Application.Rooms.Commands.LeaveRoom;
using SofaStream.Application.Rooms.Commands.ReportBufferingCompleted;
using SofaStream.Application.Rooms.Queries.GetRoomState;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;

namespace SofaStream.Api.Controllers;

/// <summary>
/// API Controller providing HTTP endpoints to manage synchronized viewing rooms and participants.
/// </summary>
/// <param name="createRoomHandler">The command handler for creating rooms.</param>
/// <param name="changePlaybackStateHandler">The command handler for changing playback state.</param>
/// <param name="changeVideoHandler">The command handler for changing active video content.</param>
/// <param name="getRoomStateHandler">The query handler for retrieving room state.</param>
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
    /// <param name="request">The room creation details.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The unique identifier of the newly created room.</returns>
    [HttpPost]
    public async Task<IActionResult> CreateRoom(
        [FromBody] CreateRoomRequest request,
        CancellationToken cancellationToken
    )
    {
        var command = new CreateRoomCommand(request.Name, request.HostId, request.Theme);
        var result = await createRoomHandler.HandleAsync(command, cancellationToken);
        
        return Ok(result.Value);
    }

    /// <summary>
    /// Changes the playback state of the room (Play, Pause, Buffering).
    /// </summary>
    /// <param name="roomId">The unique identifier of the room.</param>
    /// <param name="request">The playback change request containing current client position and requested state.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A confirmation message if successful.</returns>
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

    /// <summary>
    /// Reports that a participant has completed buffering/loading video data.
    /// </summary>
    /// <param name="roomId">The unique identifier of the room.</param>
    /// <param name="request">The participant identifier reporting completion.</param>
    /// <param name="reportBufferingCompletedHandler">The handler to process the buffering completion command.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A confirmation message if successful.</returns>
    [HttpPost("{roomId:guid}/playback/buffering-completed")]
    public async Task<IActionResult> ReportBufferingCompleted(
        [FromRoute] Guid roomId,
        [FromBody] ReportBufferingCompletedRequest request,
        [FromServices] ICommandHandler<ReportBufferingCompletedCommand, Result> reportBufferingCompletedHandler,
        CancellationToken cancellationToken
    )
    {
        var command = new ReportBufferingCompletedCommand(roomId, request.UserId);
        var result = await reportBufferingCompletedHandler.HandleAsync(command, cancellationToken);

        if (result.IsFailure)
        {
            return BadRequest(result.Error);
        }
        
        return Ok("Buffering completed successfully.");
    }

    /// <summary>
    /// Retrieves the current synchronized state (playback position, current video, participants) of the room.
    /// </summary>
    /// <param name="roomId">The unique identifier of the room.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>The room state details DTO.</returns>
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
    /// <param name="roomId">The unique identifier of the room.</param>
    /// <param name="request">The video stream details requested.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A confirmation message if successful.</returns>
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
    
    /// <summary>
    /// Registers a new user/participant to the viewing room.
    /// </summary>
    /// <param name="roomId">The unique identifier of the room to join.</param>
    /// <param name="request">The user requesting to join.</param>
    /// <param name="joinRoomHandler">The command handler for joining rooms.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A confirmation message if successful.</returns>
    [HttpPost("{roomId:guid}/join")]
    public async Task<IActionResult> JoinRoom(
        [FromRoute] Guid roomId,
        [FromBody] JoinRoomRequest request,
        [FromServices] ICommandHandler<JoinRoomCommand, Result> joinRoomHandler,
        CancellationToken cancellationToken)
    {
        var result = await joinRoomHandler.HandleAsync(new JoinRoomCommand(roomId, request.UserId), cancellationToken);
        if (result.IsFailure) return BadRequest(result.Error);
        return Ok("Room joined successfully. SignalR broadcast triggered.");
    }
    
    /// <summary>
    /// Returns the current UTC time of the server for NTP-like synchronization.
    /// </summary>
    /// <returns>The server's current UTC DateTimeOffset.</returns>
    [HttpGet("time")]
    public IActionResult GetServerTime()
    {
        return Ok(new { serverTimeUtc = DateTimeOffset.UtcNow });
    }
}

/// <summary>
/// Request contract for creating a room.
/// </summary>
/// <param name="Name">The display name of the room.</param>
/// <param name="HostId">The unique identifier of the host user.</param>
/// <param name="Theme">The initial theme name for the room UI.</param>
public record CreateRoomRequest(string Name, Guid HostId, string Theme = "Dark");

/// <summary>
/// Request contract for changing the room's playback status.
/// </summary>
/// <param name="UserId">The ID of the user requesting the change.</param>
/// <param name="RequestedState">The requested new playback state.</param>
/// <param name="ClientPosition">The current position of the client's playback.</param>
public record ChangePlaybackStateRequest(Guid UserId, PlaybackState RequestedState, TimeSpan ClientPosition);

/// <summary>
/// Request contract for changing the active video stream.
/// </summary>
/// <param name="UserId">The ID of the host user changing the video.</param>
/// <param name="VideoUrl">The URL of the new video source.</param>
/// <param name="Title">The title of the video.</param>
/// <param name="DurationSeconds">The video duration in seconds.</param>
public record ChangeVideoRequest(Guid UserId, string VideoUrl, string Title, double DurationSeconds);

/// <summary>
/// Request contract for joining a room.
/// </summary>
/// <param name="UserId">The identifier of the user joining the room.</param>
public record JoinRoomRequest(Guid UserId);

/// <summary>
/// Request contract for reporting buffering completion.
/// </summary>
/// <param name="UserId">The identifier of the user reporting buffering completion.</param>
public record ReportBufferingCompletedRequest(Guid UserId);