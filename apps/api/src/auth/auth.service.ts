import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signIn(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.active || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
    const token = await this.jwt.signAsync(payload);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async getActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, active: true },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (!user) throw new UnauthorizedException('Account is unavailable.');
    return user;
  }
}
