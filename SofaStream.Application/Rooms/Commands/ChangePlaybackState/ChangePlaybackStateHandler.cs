using System.ComponentModel;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.ChangePlaybackState;

/// <summary>
/// Handles the execution of a <see cref="ChangePlaybackStateCommand"/>.
/// Validates user permissions and coordinates the update of the room's synchronization state.
/// </summary>
/// <param name="roomRepository">The repository used to fetch and save room data.</param>
public class ChangePlaybackStateHandler(IRoomRepository roomRepository)
    : ICommandHandler<ChangePlaybackStateCommand, bool>
{
    /// <summary>
    /// Processes the playback state change request.
    /// </summary>
    /// <param name="request">The command details.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>True if the state was successfully updated; otherwise, false.</returns>
    public async Task<bool> HandleAsync(ChangePlaybackStateCommand request,
        CancellationToken cancellationToken = default)
    {
        var room = await roomRepository.GetByIdAsync(request.RoomId, cancellationToken);
        if (room == null)
            return false;

        var participant = room.Participants.FirstOrDefault(p => p.UserId == request.UserId);
        if (participant == null)
            return false;

        try
        {
            switch (request.RequestedState)
            {
                case PlaybackState.Playing:
                    room.Play(request.ClientPosition);
                    break;
                case PlaybackState.Paused:
                    room.Pause(request.ClientPosition);
                    break;
                case PlaybackState.Buffering:
                    room.ReportBuffering(request.UserId, request.ClientPosition);
                    break;
                default:
                    throw new InvalidEnumArgumentException();
            }
        }
        catch (InvalidOperationException)
        {
            return false; // TO DO
        }
        catch (InvalidEnumArgumentException)
        {
            return false; // TO DO
        }

        await roomRepository.UpdateAsync(room, cancellationToken);

        return true;
    }
}