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
public class GetRoomStateQueryHandler(ApplicationDbContext dbContext) : IQueryHandler<GetRoomStateQuery, Result<RoomStateDto>>
{
    /// <inheritdoc />
    public async Task<Result<RoomStateDto>> HandleAsync(GetRoomStateQuery query, CancellationToken cancellationToken = default)
    {
        var connection = dbContext.Database.GetDbConnection();
        
        const string sql = """
           SELECT 
               r."Id", 
               r."Name", 
               r."State" AS PlaybackState, 
               r."CurrentPosition",
               p."UserId", 
               p."IsHost", 
               p."IsBuffering"
           FROM "Rooms" r
           LEFT JOIN "RoomParticipant" p ON r."Id" = p."RoomId"
           WHERE r."Id" = @RoomId;
           """;
        
        var flatResult = await connection.QueryAsync<RoomParticipantFlatResult>(
            sql, 
            new { RoomId = query.RoomId });
        
        var resultList = flatResult.ToList();

        if (resultList.Count == 0)
            return Result<RoomStateDto>.Failure(DomainErrors.Room.NotFound);
        
        var firstRow = resultList.First();
        
        var participants = resultList
            .Where(r => r.UserId.HasValue) // Safeguard for LEFT JOIN returning nulls
            .Select(r => new ParticipantDto(r.UserId!.Value, r.IsHost, r.IsBuffering))
            .ToList();
        
        var roomState = new RoomStateDto(
            firstRow.Id,
            firstRow.Name,
            // Cast the integer from the DB back to our Domain enum, then to string
            ((PlaybackState)firstRow.PlaybackState).ToString(),
            firstRow.CurrentPosition.TotalSeconds,
            participants
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
        public int PlaybackState { get; set; }
        public TimeSpan CurrentPosition { get; set; }
        
        // Nullable because a LEFT JOIN might theoretically return a room with 0 participants
        public Guid? UserId { get; set; }
        public bool IsHost { get; set; }
        public bool IsBuffering { get; set; }
    }
}