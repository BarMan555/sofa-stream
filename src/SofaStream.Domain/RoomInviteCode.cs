using System.Security.Cryptography;

namespace SofaStream.Domain;

public static class RoomInviteCode
{
    // O/0 and I/1 are omitted so codes can be read aloud or typed.
    public const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    public const int Length = 8;

    public static string Generate() => RandomNumberGenerator.GetString(Alphabet, Length);

    public static string? Normalize(string? value)
    {
        if (value is null || value.Length > 32) return null;
        var normalized = new string(value.Where(c => c != '-' && !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();
        return normalized.Length == Length && normalized.All(Alphabet.Contains) ? normalized : null;
    }
}
