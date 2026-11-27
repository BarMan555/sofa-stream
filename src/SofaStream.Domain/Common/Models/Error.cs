namespace SofaStream.Domain.Common.Models;

/// <summary>
/// Represents a domain error containing a unique code and a descriptive message.
/// Used to propagate failure details without throwing exceptions.
/// </summary>
/// <param name="Code">The unique string code identifying the error type.</param>
/// <param name="Description">A human-readable description of the error.</param>
public record Error(string Code, string Description)
{
    /// <summary>
    /// Represents the absence of an error.
    /// Used for successful operation results.
    /// </summary>
    public static readonly Error None = new(string.Empty, string.Empty);
}