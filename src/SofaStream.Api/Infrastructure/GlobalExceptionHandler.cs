using Microsoft.AspNetCore.Diagnostics;
using SofaStream.Domain.Common.Models;

namespace SofaStream.Api.Infrastructure;

/// <summary>
/// Global interceptor for unhandled exceptions.
/// Captures any system crashes and transforms them into a standardized 500 Internal Server Error JSON response,
/// preventing sensitive stack traces from leaking to the client.
/// </summary>
/// <param name="logger">The logger used to record the actual exception details for internal monitoring.</param>
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    /// <summary>
    /// Attempts to handle the specified exception asynchronously.
    /// </summary>
    /// <param name="httpContext">The current HTTP context representing the client request.</param>
    /// <param name="exception">The unhandled exception that occurred during request processing.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>True if the exception was successfully handled; otherwise, false.</returns>
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        logger.LogError(exception, "A critical unhandled exception occurred: {Message}", exception.Message);
        
        var errorResponce = new Error(
                "Server.InternalError", 
                "An unexpected internal server error occurred. Please try again later.");

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        httpContext.Response.ContentType = "application/json";
        
        await httpContext.Response.WriteAsJsonAsync(errorResponce, cancellationToken );
        
        return true;
    }
}