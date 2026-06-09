using SofaStream.Domain.Common.Models;

namespace SofaStream.Domain;

/// <summary>
/// Contains predefined domain error constants for the SofaStream application.
/// </summary>
public static class DomainErrors
{
    /// <summary>
    /// Errors associated with the Room aggregate and its operations.
    /// </summary>
    public static class Room
    {
        /// <summary>
        /// Error indicating that playback cannot start because one or more participants are still buffering.
        /// </summary>
        public static readonly Error CannotPlayWhileBuffering = new Error(
            "Room.CannotPlayWhileBuffering",
            "Playback cannot be started while other participants are buffering the video.");
        
        /// <summary>
        /// Error indicating that the requested participant was not found in the room.
        /// </summary>
        public static readonly Error ParticipantNotFound = new(
            "Room.ParticipantNotFound", 
            "The specified participant was not found in this room.");
            
        /// <summary>
        /// Error indicating that the requested room was not found.
        /// </summary>
        public static readonly Error NotFound = new(
            "Room.NotFound", 
            "A room with the specified ID was not found.");
        
        /// <summary>
        /// Error indicating that the requested playback state is invalid or not supported.
        /// </summary>
        public static readonly Error InvalidPlaybackState = new(
            "Room.InvalidPlaybackState", 
            "Запрошенное состояние плеера некорректно или не поддерживается.");
        
        /// <summary>
        /// Error indicating that the playback seek position is out of valid video bounds.
        /// </summary>
        public static readonly Error InvalidPosition = new(
            "Room.InvalidPosition", 
            "The playback position cannot be negative or exceed the video duration.");
        
        /// <summary>
        /// Error indicating that the user lacks host privileges required for the requested action.
        /// </summary>
        public static readonly Error NotHost = new(
            "Room.NotHost",
            "The user is not host.");

        /// <summary>
        /// Error indicating that the room is full and cannot accommodate more participants.
        /// </summary>
        public static readonly Error RoomFull = new(
            "Room.RoomFull", 
            "The room has reached the maximum capacity of 4 participants.");
    }
}