import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
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
    if (user.patientId) {
      const patient = await this.prisma.patient.findUnique({where:{id:user.patientId},select:{archivedAt:true}});
      if (!patient || patient.archivedAt) throw new UnauthorizedException('Account is unavailable.');
    }
    await this.prisma.auditLog.create({data:{userId:user.id,action:'AUTH_LOGIN',entityType:'User',entityId:user.id}});

    const payload = {
      sub: user.id,
      sessionVersion: user.sessionVersion,
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

  async signOut(token?: string) {
    if (!token) return;
    let payload: {sub:string; sessionVersion?:number};
    try { payload = await this.jwt.verifyAsync(token); } catch { return; }
    if (!payload.sub) return;
    await this.prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({where:{id:payload.sub,sessionVersion:payload.sessionVersion??0},data:{sessionVersion:{increment:1}}});
      if (changed.count) await tx.auditLog.create({data:{userId:payload.sub,action:'AUTH_LOGOUT',entityType:'User',entityId:payload.sub}});
    });
  }

  async changePassword(id:string, currentPassword:string, password:string) {
    if (password.length < 14 || Buffer.byteLength(password)>72) throw new BadRequestException('Use at least 14 characters and at most 72 UTF-8 bytes.');
    const user = await this.prisma.user.findUnique({where:{id}});
    if (!user?.active || !(await compare(currentPassword,user.passwordHash))) throw new UnauthorizedException('Current password is incorrect.');
    if (await compare(password,user.passwordHash)) throw new BadRequestException('Choose a different password.');
    const passwordHash = await hash(password,12);
    await this.prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({where:{id,passwordHash:user.passwordHash,sessionVersion:user.sessionVersion},data:{passwordHash,sessionVersion:{increment:1}}});
      if (!changed.count) throw new ConflictException('Account changed. Sign in and try again.');
      await tx.auditLog.create({data:{userId:id,action:'AUTH_PASSWORD_CHANGED',entityType:'User',entityId:id}});
    });
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
