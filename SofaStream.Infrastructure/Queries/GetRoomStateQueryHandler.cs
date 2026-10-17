using Dapper;
using Microsoft.EntityFrameworkCore;
using SofaStream.Application.Common.Interfaces;
using SofaStream.Application.Rooms.Queries.GetRoomState;
using SofaStream.Domain;
using SofaStream.Domain.Common.Models;
using SofaStream.Domain.Entities;
using SofaStream.Infrastructure.Persistence;

namespace SofaStream.Infrastructure.Queries;

/// <summary>
/// Handles the execution of a <see cref="GetRoomStateQuery"/>.
/// Utilizes Dapper for high-performance raw SQL querying, bypassing the EF Core Change Tracker.
/// </summary>
/// <param name="dbContext">The database context used to extract the underlying ADO.NET connection.</param>
public class GetRoomStateQueryHandler(ApplicationDbContext dbContext, TimeProvider timeProvider) : IQueryHandler<GetRoomStateQuery, Result<RoomStateDto>>
{
    /// <inheritdoc />
    public async Task<Result<RoomStateDto>> HandleAsync(GetRoomStateQuery query, CancellationToken cancellationToken = default)
    {
        var connection = dbContext.Database.GetDbConnection();
        
        const string sql = """
           SELECT 
               r."Id", 
               r."Name", 
               r."Theme",
               r."CurrentVideo_Url" AS VideoUrl,          
               r."CurrentVideo_Title" AS VideoTitle,     
               r."CurrentVideo_Duration" AS VideoDuration,
               r."State" AS PlaybackState, 
               r."CurrentPosition",
               r."LastUpdatedAt",
               r."PlaybackStartedAt",
               r."VideoRevision",
               p."UserId", 
               p."IsHost", 
               p."IsBuffering"
           FROM "Rooms" r
           LEFT JOIN "RoomParticipant" p ON r."Id" = p."RoomId"
           WHERE r."Id" = @RoomId;
           """;
        
        var flatResult = await connection.QueryAsync<RoomParticipantFlatResult>(new CommandDefinition(
            sql, new { RoomId = query.RoomId }, cancellationToken: cancellationToken));
        
        var resultList = flatResult.ToList();

        if (resultList.Count == 0)
            return Result<RoomStateDto>.Failure(DomainErrors.Room.NotFound);
        
        var firstRow = resultList.First();
        var snapshotAt = timeProvider.GetUtcNow();
        var playbackState = (PlaybackState)firstRow.PlaybackState;
        var startedAt = firstRow.PlaybackStartedAt ?? firstRow.LastUpdatedAt;
        var position = PlaybackPosition.At(playbackState, firstRow.CurrentPosition,
            startedAt, snapshotAt, firstRow.VideoDuration);
        
        var participants = resultList
            .Where(r => r.UserId.HasValue) // Safeguard for LEFT JOIN returning nulls
            .Select(r => new ParticipantDto(r.UserId!.Value, r.IsHost, r.IsBuffering))
            .ToList();

        VideoDto? videoDto = firstRow.VideoUrl != null
            ? new VideoDto(firstRow.VideoUrl, firstRow.VideoTitle!, firstRow.VideoDuration!.Value.TotalSeconds)
            : null;
            
        var roomState = new RoomStateDto(
            firstRow.Id,
            firstRow.Name,
            // Cast the integer from the DB back to our Domain enum, then to string
            playbackState.ToString(),
            position.TotalSeconds,
            videoDto,
            participants,
            firstRow.Theme,
            snapshotAt,
            firstRow.LastUpdatedAt,
            playbackState == PlaybackState.Playing && startedAt > snapshotAt ? startedAt : null,
            firstRow.VideoRevision
        );
        
        return Result<RoomStateDto>.Success(roomState);
    }
    
    /// <summary>
    /// A private, flat data transfer object used strictly to capture the raw SQL result set.
    /// </summary>
    private class RoomParticipantFlatResult
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Theme { get; set; } = "Dark";
        public string? VideoUrl { get; set; }
        public string? VideoTitle { get; set; }
        public TimeSpan? VideoDuration { get; set; }
        public int PlaybackState { get; set; }
        public TimeSpan CurrentPosition { get; set; }
        public DateTimeOffset LastUpdatedAt { get; set; }
        public DateTimeOffset? PlaybackStartedAt { get; set; }
        public long VideoRevision { get; set; }
        
        // Nullable because a LEFT JOIN might theoretically return a room with 0 participants
        public Guid? UserId { get; set; }
        public bool IsHost { get; set; }
        public bool IsBuffering { get; set; }
    }
}
