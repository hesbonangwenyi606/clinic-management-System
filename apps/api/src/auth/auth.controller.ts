import { Body, Controller, Get, Post, Res, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { ServiceAuthorized } from './service-authorized.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestRecoveryDto, ResetRecoveryDto } from './dto/password-recovery.dto';

const COOKIE_NAME = 'cms_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1',
  maxAge: 15 * 60 * 1000,
};

@Controller('auth')
@ServiceAuthorized()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.signIn(body.email, body.password);
    response.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
    return { user: result.user };
  }

  @Public()
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.clearCookie(COOKIE_NAME, {
      path: COOKIE_OPTIONS.path,
      sameSite: COOKIE_OPTIONS.sameSite,
      secure: COOKIE_OPTIONS.secure,
    });
    await this.auth.signOut(request.cookies?.[COOKIE_NAME]);
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('password-recovery')
  async requestRecovery(@Body() body: RequestRecoveryDto) {
    await this.auth.requestRecovery(body.email);
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password-recovery/reset')
  async resetRecovery(@Body() body: ResetRecoveryDto) {
    await this.auth.resetRecovery(body.email, body.code, body.password);
    return { success: true };
  }

  @Post('password')
  async changePassword(@Body() body: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser, @Res({passthrough:true}) response: Response) {
    await this.auth.changePassword(user.sub,body.currentPassword,body.password);
    response.clearCookie(COOKIE_NAME,{path:COOKIE_OPTIONS.path,sameSite:COOKIE_OPTIONS.sameSite,secure:COOKIE_OPTIONS.secure});
    return {success:true};
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getActiveUser(user.sub);
  }
}
