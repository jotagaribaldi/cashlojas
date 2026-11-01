import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';
import { CsrfProtected, CurrentUser, Public, ReqContext } from '../common/decorators';
import { CSRF_COOKIE } from '../common/guards/csrf.guard';
import { AuthUser, RequestContext } from '../common/types';
import { Env } from '../config/env';
import { ActivationService } from './activation.service';
import { AuthService } from './auth.service';
import { ActivateAccountDto, ActivationCheckDto, ChangePasswordDto, LoginDto, RegisterCustomerDto } from './dto';
import { IssuedTokens } from './token.service';

export const REFRESH_COOKIE = 'cl_rt';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly activation: ActivationService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private baseCookie(): CookieOptions {
    return { secure: this.config.get('COOKIE_SECURE', { infer: true }), sameSite: 'strict' };
  }

  private setSessionCookies(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.baseCookie(),
      httpOnly: true,
      path: '/api/auth',
      expires: tokens.refreshExpiresAt,
    });
    res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
      ...this.baseCookie(),
      httpOnly: false,
      path: '/',
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearSessionCookies(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { ...this.baseCookie(), httpOnly: true, path: '/api/auth' });
    res.clearCookie(CSRF_COOKIE, { ...this.baseCookie(), path: '/' });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @ReqContext() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    const { accessToken, user, ...tokens } = await this.auth.login(dto, ctx);
    this.setSessionCookies(res, { accessToken, ...tokens });
    return { accessToken, user };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterCustomerDto,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user, ...tokens } = await this.auth.register(dto, ctx);
    this.setSessionCookies(res, { accessToken, ...tokens });
    return { accessToken, user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('activation/check')
  @HttpCode(200)
  checkActivation(@Body() dto: ActivationCheckDto) {
    return this.activation.check(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('activate')
  @HttpCode(200)
  async activate(@Body() dto: ActivateAccountDto, @ReqContext() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    const { accessToken, user, ...tokens } = await this.activation.activate(dto.token, dto.password, ctx);
    this.setSessionCookies(res, { accessToken, ...tokens });
    return { accessToken, user };
  }

  @Public()
  @CsrfProtected()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @ReqContext() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    try {
      const { accessToken, user, ...tokens } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], ctx);
      this.setSessionCookies(res, { accessToken, ...tokens });
      return { accessToken, user };
    } catch (err) {
      this.clearSessionCookies(res);
      throw err;
    }
  }

  @Public()
  @CsrfProtected()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearSessionCookies(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(user.id, ctx);
    this.clearSessionCookies(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.id, dto, ctx);
    this.clearSessionCookies(res);
  }
}
