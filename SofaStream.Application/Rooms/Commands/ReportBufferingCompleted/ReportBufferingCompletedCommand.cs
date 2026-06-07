using System;
using SofaStream.Domain.Common.Models;

namespace SofaStream.Application.Rooms.Commands.ReportBufferingCompleted;

/// <summary>
/// Command to report that a room participant has completed buffering/loading video data.
/// </summary>
/// <param name="RoomId">The unique identifier of the synchronized room session.</param>
/// <param name="UserId">The unique identifier of the participant who recovered from buffering.</param>
public record ReportBufferingCompletedCommand(Guid RoomId, Guid UserId);
