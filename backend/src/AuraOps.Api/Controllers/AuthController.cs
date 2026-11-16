using System.IdentityModel.Tokens.Jwt;
using AuraOps.Api.Auth;
using AuraOps.Application.Abstractions;
using AuraOps.Application.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using AuraOps.Domain.Entities;

namespace AuraOps.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IUserAdminService users, JwtTokenService tokens) : ControllerBase
{
    /// <summary>Authenticate with e-mail and password and obtain a bearer access token.</summary>
    /// <response code="200">Signed in.</response>
    /// <response code="401">Invalid credentials, locked out or deactivated account.</response>
    /// <response code="429">Too many sign-in attempts.</response>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType<LoginResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var result = await users.CheckCredentialsAsync(request.Email, request.Password, ct);
        if (result.Outcome != LoginOutcome.Success)
        {
            var detail = result.Outcome switch
            {
                LoginOutcome.LockedOut => "Account temporarily locked after repeated failed attempts. Try again later.",
                LoginOutcome.Inactive => "This account has been deactivated.",
                _ => "Invalid e-mail or password.",
            };
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Sign-in failed", detail: detail);
        }

        var (token, expires) = tokens.CreateToken(result.User!, result.SecurityStamp!);
        return new LoginResponse(token, expires, result.User!);
    }

    /// <summary>Current user's profile and roles.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me(CancellationToken ct) =>
        await users.FindAsync(User.FindFirst(JwtRegisteredClaimNames.Sub)!.Value, ct) is { } me ? me : Unauthorized();

    /// <summary>Sign out everywhere: rotates the security stamp so all issued tokens stop working.</summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout([FromServices] UserManager<ApplicationUser> userManager)
    {
        var user = await userManager.FindByIdAsync(User.FindFirst(JwtRegisteredClaimNames.Sub)!.Value);
        if (user is not null) await userManager.UpdateSecurityStampAsync(user);
        return NoContent();
    }
}
