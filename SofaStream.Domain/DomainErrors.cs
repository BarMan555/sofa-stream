using SofaStream.Domain.Common.Models;

namespace SofaStream.Domain;

public static class DomainErrors
{
    public static class Room
    {
        public static readonly Error CannotPlayWhileBuffering = new Error(
            "Room.CannotPlayWhileBuffering",
            "Playback cannot be started while other participants are buffering the video.");
        
        public static readonly Error ParticipantNotFound = new(
            "Room.ParticipantNotFound", 
            "The specified participant was not found in this room.");
            
        public static readonly Error NotFound = new(
            "Room.NotFound", 
            "A room with the specified ID was not found.");
        
        public static readonly Error InvalidPlaybackState = new(
            "Room.InvalidPlaybackState", 
            "Запрошенное состояние плеера некорректно или не поддерживается.");
        
        public static readonly Error InvalidPosition = new(
            "Room.InvalidPosition", 
            "The playback position cannot be negative or exceed the video duration.");
        
        public static readonly Error NotHost = new(
            "Room.NotHost",
            "The user is not host.");
    }
}