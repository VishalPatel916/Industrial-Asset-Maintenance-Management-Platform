using AuraOps.Application.Common;
using AuraOps.Domain.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AuraOps.Api.Middleware;

/// <summary>
/// Centralised exception → RFC 7807 problem-details mapping, so every error has the same shape:
/// { type, title, status, detail, instance, traceId, errors? }.
/// </summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        ProblemDetails problem = exception switch
        {
            ValidationException v => new ValidationProblemDetails(v.Errors)
                { Status = 400, Title = "Validation failed", Detail = v.Message } as ProblemDetails,
            NotFoundException => new ProblemDetails { Status = 404, Title = "Not found", Detail = exception.Message },
            ForbiddenException => new() { Status = 403, Title = "Forbidden", Detail = exception.Message },
            ConflictException => new() { Status = 409, Title = "Conflict", Detail = exception.Message },
            DomainException => new() { Status = 409, Title = "Business rule violated", Detail = exception.Message },
            DbUpdateException => new()
                { Status = 409, Title = "Conflict", Detail = "The change conflicts with existing data (a constraint was violated)." },
            BadHttpRequestException b => new() { Status = b.StatusCode, Title = "Bad request", Detail = b.Message },
            OperationCanceledException when context.RequestAborted.IsCancellationRequested =>
                new() { Status = 499, Title = "Client closed request" },
            _ => new() { Status = 500, Title = "An unexpected error occurred", Detail = "The error has been logged." },
        };

        if (problem.Status >= 500)
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", context.Request.Method, context.Request.Path);
        else if (exception is DbUpdateException)
            logger.LogWarning(exception, "Database constraint violation for {Method} {Path}", context.Request.Method, context.Request.Path);
        else
            logger.LogInformation("{ExceptionType} for {Method} {Path}: {Message}",
                exception.GetType().Name, context.Request.Method, context.Request.Path, exception.Message);

        context.Response.StatusCode = problem.Status ?? 500;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context, ProblemDetails = problem, Exception = exception,
        });
    }
}
