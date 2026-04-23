using System.Windows.Input;

namespace SofaStream.Application.Rooms.Commands.ChangeVideo;

/// <summary>
/// Command to change the active video content in a specific room.
/// </summary>
/// <param name="RoomId">The target room identifier.</param>
/// <param name="UserId">The identifier of the user making the request (must be the host).</param>
/// <param name="VideoUrl">The URL of the new video stream.</param>
/// <param name="Title">The title of the new video.</param>
/// <param name="DurationSeconds">The total duration of the video in seconds.</param>
public record ChangeVideoCommand(
    Guid RoomId, 
    Guid UserId, 
    string VideoUrl, 
    string Title, 
    double DurationSeconds);