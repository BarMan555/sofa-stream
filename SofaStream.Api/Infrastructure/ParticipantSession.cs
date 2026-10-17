using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;

namespace SofaStream.Api.Infrastructure;

// Anonymous participants still have a server-issued identity. A public UserId is never a credential.
public sealed class ParticipantSession(IDataProtectionProvider protection, TimeProvider clock)
{
    public const string Scheme = "ParticipantSession";
    private readonly IDataProtector _protector = protection.CreateProtector("SofaStream.ParticipantSession.v1");

    public SessionTicket Issue(Guid userId)
    {
        var expiresAt = clock.GetUtcNow().AddDays(1);
        var token = _protector.Protect($"{userId:D}|{expiresAt.ToUnixTimeSeconds()}");
        return new SessionTicket(userId, token, expiresAt);
    }

    public SessionTicket? Validate(string token)
    {
        try
        {
            var parts = _protector.Unprotect(token).Split('|');
            if (parts.Length == 2 && Guid.TryParse(parts[0], out var userId) && userId != Guid.Empty &&
                long.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var expiry) &&
                expiry > clock.GetUtcNow().ToUnixTimeSeconds()) return new SessionTicket(userId, token, DateTimeOffset.FromUnixTimeSeconds(expiry));
        }
        catch (CryptographicException) { }
        return null;
    }

    public static Guid UserId(ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
}

public sealed record SessionTicket(Guid UserId, string Token, DateTimeOffset ExpiresAt);

public sealed class ParticipantSessionHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder,
    ParticipantSession sessions) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var authorization = Request.Headers.Authorization.ToString();
        var token = authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? authorization[7..] : null;
        // Browser WebSocket/SSE APIs cannot set Authorization; accept query tokens only at this Hub.
        if (token is null && Request.Path.StartsWithSegments("/hubs/room")) token = Request.Query["access_token"];
        if (string.IsNullOrEmpty(token)) return Task.FromResult(AuthenticateResult.NoResult());
        var session = sessions.Validate(token);
        if (session is null) return Task.FromResult(AuthenticateResult.Fail("Invalid or expired participant session."));
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, session.UserId.ToString())], ParticipantSession.Scheme);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity),
            new AuthenticationProperties { ExpiresUtc = session.ExpiresAt }, ParticipantSession.Scheme)));
    }
}
