using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SofaStream.Api.Infrastructure;

namespace SofaStream.Api.Controllers;

[ApiController]
[Route("api/session")]
public sealed class SessionController(ParticipantSession sessions) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost]
    public IActionResult Create() => Ok(sessions.Issue(Guid.NewGuid()));

    [Authorize]
    [HttpGet]
    public IActionResult Current() => Ok(new { userId = ParticipantSession.UserId(User) });
}
