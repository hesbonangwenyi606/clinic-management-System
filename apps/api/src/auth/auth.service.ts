import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHmac, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
const nodemailer = require('nodemailer') as typeof import('nodemailer');
const DUMMY_PASSWORD_HASH = '$2b$12$Fdi9tlurYZVfG1QKHgt/yeyz3FRkQA9rGg78pVTOIpsQt4r1Q5uqG';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private recoveryHash(userId:string, code:string) {
    return createHmac('sha256', process.env.JWT_SECRET!).update(`${userId}:${code}`).digest('hex');
  }

  async requestRecovery(email:string) {
    const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) throw new ServiceUnavailableException('Password recovery email is not configured.');
    const user = await this.prisma.user.findUnique({where:{email:email.trim().toLowerCase()},select:{id:true,email:true,active:true,sessionVersion:true,patient:{select:{archivedAt:true}}}});
    if (!user?.active || user.patient?.archivedAt) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = this.recoveryHash(user.id,code);
    const changed = await this.prisma.$executeRaw`INSERT INTO "PasswordRecovery" ("userId","codeHash","sessionVersion","expiresAt") VALUES (${user.id}::uuid,${codeHash},${user.sessionVersion},NOW() + INTERVAL '10 minutes') ON CONFLICT ("userId") DO UPDATE SET "codeHash"=EXCLUDED."codeHash", "sessionVersion"=EXCLUDED."sessionVersion", "expiresAt"=EXCLUDED."expiresAt", "attempts"=0, "createdAt"=NOW() WHERE "PasswordRecovery"."createdAt" < NOW() - INTERVAL '60 seconds'`;
    if (!changed) return;
    const port = Number(process.env.SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({host:SMTP_HOST,port,secure:port===465,requireTLS:true,auth:{user:SMTP_USER,pass:SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    try { await transport.sendMail({from:SMTP_FROM,to:user.email,subject:'Your clinic password reset code',text:`Your password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`}); }
    catch { this.logger.error('Password recovery email could not be delivered. Check SMTP settings.'); await this.prisma.$executeRaw`DELETE FROM "PasswordRecovery" WHERE "userId"=${user.id}::uuid AND "codeHash"=${codeHash}`; }
    finally { transport.close(); }
  }

  async resetRecovery(email:string, code:string, password:string) {
    if (password.length < 14 || Buffer.byteLength(password)>72) throw new BadRequestException('Use at least 14 characters and at most 72 UTF-8 bytes.');
    const user = await this.prisma.user.findUnique({where:{email:email.trim().toLowerCase()},select:{id:true,active:true,sessionVersion:true,patient:{select:{archivedAt:true}}}});
    if (!user?.active || user.patient?.archivedAt) throw new BadRequestException('The code is invalid or expired.');
    const passwordHash = await hash(password,12);
    const codeHash = this.recoveryHash(user.id,code);
    const success = await this.prisma.$transaction(async tx => {
      const attempted = await tx.$executeRaw`UPDATE "PasswordRecovery" SET "attempts"="attempts"+1 WHERE "userId"=${user.id}::uuid AND "expiresAt">NOW() AND "attempts"<5 AND "sessionVersion"=${user.sessionVersion}`;
      if (!attempted) return false;
      const consumed = await tx.$executeRaw`DELETE FROM "PasswordRecovery" WHERE "userId"=${user.id}::uuid AND "codeHash"=${codeHash} AND "expiresAt">NOW() AND "sessionVersion"=${user.sessionVersion}`;
      if (!consumed) return false;
      const changed = await tx.user.updateMany({where:{id:user.id,active:true,sessionVersion:user.sessionVersion},data:{passwordHash,sessionVersion:{increment:1}}});
      if (!changed.count) return false;
      await tx.auditLog.create({data:{userId:user.id,action:'AUTH_PASSWORD_RESET',entityType:'User',entityId:user.id}});
      return true;
    });
    if (!success) throw new BadRequestException('The code is invalid or expired.');
  }

  async signIn(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    const matches = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.active || !matches) {
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
