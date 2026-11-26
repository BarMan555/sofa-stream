using Microsoft.AspNetCore.Mvc.Filters;

namespace SofaStream.Api.Infrastructure;

// This deployment runs one API process. Serialize membership and playback writes with Hub cleanup.
// A single bounded gate avoids a growing dictionary of locks for untrusted room IDs.
public sealed class RoomMutationGate
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public async Task<IDisposable> EnterAsync(CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        return new Lease(_gate);
    }
    private sealed class Lease(SemaphoreSlim gate) : IDisposable
    {
        public void Dispose() => gate.Release();
    }
}

public sealed class RoomMutationFilter(RoomMutationGate gate) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (HttpMethods.IsGet(context.HttpContext.Request.Method)) { await next(); return; }
        using (await gate.EnterAsync(context.HttpContext.RequestAborted)) await next();
    }
}
