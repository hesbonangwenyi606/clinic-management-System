import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';

const SESSION_COOKIE = 'cms_session';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Sign in is required.');

    let payload: AuthenticatedUser;
    try {
      payload = await this.jwt.verifyAsync<AuthenticatedUser>(token);
    } catch {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }
    if (!payload.sub) throw new UnauthorizedException('Session is invalid.');

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, active: true },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, sessionVersion: true },
    });
    if (!user || !Object.values(UserRole).includes(user.role) || (payload.sessionVersion ?? 0) !== user.sessionVersion) {
      throw new UnauthorizedException('Account is unavailable.');
    }
    if (user.role === 'PATIENT') {
      const account = await this.prisma.user.findUnique({where:{id:user.id},select:{patient:{select:{archivedAt:true}}}});
      if (!account?.patient || account.patient.archivedAt) throw new UnauthorizedException('Account is unavailable.');
    }
    request.user = { sub: user.id, ...user };
    return true;
  }
}
