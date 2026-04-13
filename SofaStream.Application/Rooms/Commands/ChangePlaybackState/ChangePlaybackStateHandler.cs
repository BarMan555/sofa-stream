using MediatR;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Domain.Entities;

namespace SofaStream.Application.Rooms.Commands.ChangePlaybackState;

public class ChangePlaybackStateHandler(IRoomRepository roomRepository) : IRequestHandler<ChangePlaybackStateCommand, bool>
{
    public async Task<bool> Handle(ChangePlaybackStateCommand request, CancellationToken cancellationToken)
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
            }
        }
        catch (InvalidOperationException)
        {
            return false;
        }

        await roomRepository.UpdateAsync(room, cancellationToken);

        return true;
    }
}